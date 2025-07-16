const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.json({ limit: '10mb' }));

const nodesUrl = 'https://drive.google.com/uc?export=download&id=1DoXz1PTDVtiKyl0_DzRGCdCv2T_SklxD';
const edgesUrl = 'https://drive.google.com/uc?export=download&id=1-eNNWnCwlSm0gG1deFPTyR726NWDAHWS';


let graphNodes = null;
let graphEdges = null;

async function loadGraphData() {
  try {
    const [nodesRes, edgesRes] = await Promise.all([
      fetch(nodesUrl),
      fetch(edgesUrl)
    ]);
    const allNodes = await nodesRes.json(); // Load all nodes initially
    graphEdges = await edgesRes.json();
    console.log('Graph data loaded from Google Drive!');

    // --- START: NEW FILTERING LOGIC ---

    // Create a set of all node IDs that are part of the road network
    const routableNodeIds = new Set();
    for (const startNode in graphEdges) {
      routableNodeIds.add(startNode); // Add the starting node of an edge
      for (const edge of graphEdges[startNode]) {
        routableNodeIds.add(String(edge.node)); // Add the destination node
      }
    }
    console.log(`Found ${routableNodeIds.size} routable nodes in the edge data.`);

    // Filter the original nodes list to only include nodes that are in our set
    graphNodes = allNodes.filter(node => routableNodeIds.has(String(node.id)));
    
    console.log(`Filtered all nodes down to ${graphNodes.length} routable nodes.`);
    // --- END: NEW FILTERING LOGIC ---

  } catch (err) {
    console.error('Failed to load graph data:', err);
  }
}
// Load data at startup
loadGraphData();

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// --- START: IMPROVED findNearestNode FUNCTION ---
function findNearestNode(lat, lng, nodes, excludeNodeId = null) {
  let minDist = Infinity;
  let nearest = null;
  for (const node of nodes) {
    // Skip the excluded node if specified
    if (excludeNodeId && String(node.id) === String(excludeNodeId)) {
      continue;
    }
    const dist = haversine(node.lat, node.lng, lat, lng);
    if (dist < minDist) {
      minDist = dist;
      nearest = node.id;
    }
  }
  return nearest;
}
// --- END: IMPROVED findNearestNode FUNCTION ---

// --- BIDIRECTIONAL DIJKSTRA FUNCTION ---
function bidirectionalDijkstra(graph, start, end) {
  // Handle same start and end case
  if (start === end) {
    return { path: [start], distance: 0 };
  }

  // Initialize data structures for both directions
  const distancesForward = {}, prevForward = {}, visitedForward = new Set();
  const distancesBackward = {}, prevBackward = {}, visitedBackward = new Set();
  const queueForward = [], queueBackward = [];

  // Initialize all nodes with Infinity distance
  for (const node in graph) {
    distancesForward[node] = Infinity;
    distancesBackward[node] = Infinity;
    prevForward[node] = null;
    prevBackward[node] = null;
  }
  
  // Also add nodes that might be destinations but not origins
  for (const node in graph) {
    for (const edge of graph[node]) {
      if (distancesForward[edge.node] === undefined) {
        distancesForward[edge.node] = Infinity;
        distancesBackward[edge.node] = Infinity;
        prevForward[edge.node] = null;
        prevBackward[edge.node] = null;
      }
    }
  }

  // Check if start and end nodes are valid
  if (distancesForward[start] === undefined || distancesBackward[end] === undefined) {
    console.error("Start or end node not found in graph.");
    return { path: [], distance: Infinity };
  }
  
  // Initialize start and end nodes
  distancesForward[start] = 0;
  distancesBackward[end] = 0;
  queueForward.push({ node: start, dist: 0 });
  queueBackward.push({ node: end, dist: 0 });

  let bestDistance = Infinity;
  let meetingNode = null;

  // Run both searches simultaneously
  while (queueForward.length > 0 || queueBackward.length > 0) {
    // Check if we can stop early
    const minForward = queueForward.length > 0 ? queueForward[0].dist : Infinity;
    const minBackward = queueBackward.length > 0 ? queueBackward[0].dist : Infinity;
    
    if (minForward + minBackward >= bestDistance) {
      break; // No better path possible
    }

    // Process forward search
    if (queueForward.length > 0 && minForward <= minBackward) {
      queueForward.sort((a, b) => a.dist - b.dist);
      const { node: current, dist: currentDist } = queueForward.shift();
      
      if (!current || visitedForward.has(current)) continue;
      visitedForward.add(current);

      // Check if this node was reached by backward search
      if (visitedBackward.has(current)) {
        const totalDist = distancesForward[current] + distancesBackward[current];
        if (totalDist < bestDistance) {
          bestDistance = totalDist;
          meetingNode = current;
        }
      }

      // Explore neighbors
      const neighbors = graph[current] || [];
      for (const { node: neighbor, weight } of neighbors) {
        const alt = distancesForward[current] + weight;
        if (distancesForward[neighbor] === undefined) {
          distancesForward[neighbor] = Infinity;
        }
        if (alt < distancesForward[neighbor]) {
          distancesForward[neighbor] = alt;
          prevForward[neighbor] = current;
          queueForward.push({ node: neighbor, dist: alt });
        }
      }
    }
    // Process backward search
    else if (queueBackward.length > 0) {
      queueBackward.sort((a, b) => a.dist - b.dist);
      const { node: current, dist: currentDist } = queueBackward.shift();
      
      if (!current || visitedBackward.has(current)) continue;
      visitedBackward.add(current);

      // Check if this node was reached by forward search
      if (visitedForward.has(current)) {
        const totalDist = distancesForward[current] + distancesBackward[current];
        if (totalDist < bestDistance) {
          bestDistance = totalDist;
          meetingNode = current;
        }
      }

      // Explore neighbors (in reverse direction)
      // For backward search, we need to find nodes that have edges TO current
      for (const sourceNode in graph) {
        const edges = graph[sourceNode] || [];
        for (const edge of edges) {
          if (String(edge.node) === String(current)) {
            const alt = distancesBackward[current] + edge.weight;
            if (distancesBackward[sourceNode] === undefined) {
              distancesBackward[sourceNode] = Infinity;
            }
            if (alt < distancesBackward[sourceNode]) {
              distancesBackward[sourceNode] = alt;
              prevBackward[sourceNode] = current;
              queueBackward.push({ node: sourceNode, dist: alt });
            }
          }
        }
      }
    }
  }
  
  // Reconstruct path if meeting node found
  if (meetingNode !== null) {
    const path = [];
    
    // Reconstruct forward path (start to meeting node)
    let u = meetingNode;
    while (u) {
      path.unshift(u);
      u = prevForward[u];
    }
    
    // Reconstruct backward path (meeting node to end, excluding meeting node)
    u = prevBackward[meetingNode];
    while (u) {
      path.push(u);
      u = prevBackward[u];
    }
    
    return { path, distance: bestDistance };
  }

  return { path: [], distance: Infinity };
}

// --- START: ROBUST ROUTE CALCULATION LOGIC ---
app.post('/calculate_route', async (req, res) => {
  if (!graphNodes || !graphEdges) {
    return res.status(503).json({ success: false, error: 'Graph data not loaded yet. Please try again in a moment.' });
  }
  const { start, end, deviceInfo } = req.body;

  let startNode = findNearestNode(start.lat, start.lng, graphNodes);
  let endNode = findNearestNode(end.lat, end.lng, graphNodes);

  // If the nodes are the same, find the next closest node for the endpoint
  if (String(startNode) === String(endNode)) {
    console.log(`Initial nodes are identical (${startNode}). Finding alternative for end point.`);
    endNode = findNearestNode(end.lat, end.lng, graphNodes, startNode); // Exclude the startNode
  }

  // If they are STILL the same, it means the locations are truly indistinguishable
  if (String(startNode) === String(endNode)) {
      console.log('Start and end nodes are still the same. Locations are likely too close to differentiate.');
      return res.json({ 
          success: false, 
          error: 'Start and end locations are too close to calculate a meaningful route.' 
      });
  }

  // Detect indoor status for start and end points
  const startIndoor = comprehensiveIndoorDetection(start, deviceInfo);
  const endIndoor = comprehensiveIndoorDetection(end, deviceInfo);
  
  console.log('Start coordinates:', start);
  console.log('End coordinates:', end);
  console.log('Start indoor detection:', startIndoor);
  console.log('End indoor detection:', endIndoor);
  console.log('Final Start node:', startNode);
  console.log('Final End node:', endNode);

  if (!startNode || !endNode) {
    console.log('Could not find a nearby road for the start or end point.');
    return res.json({ success: false, error: 'Could not find a nearby road for the start or end point.' });
  }

  const result = bidirectionalDijkstra(graphEdges, String(startNode), String(endNode));

  console.log('Dijkstra result:', result);

  if (!result.path || result.path.length < 1) {
    console.log('No valid route found by Dijkstra. The locations may not be connected by the road network.');
    return res.json({ success: false, error: 'No route found. The locations may not be connected by road.' });
  }

  // Convert node IDs to lat/lng
  const coords = result.path.map(id => {
    // Ensure we find based on string comparison
    const node = graphNodes.find(n => String(n.id) === String(id));
    return node ? { lat: node.lat, lng: node.lng } : null;
  }).filter(Boolean);

  console.log('Route coordinates:', coords.length);
  res.json({ 
    success: true, 
    route: coords,
    indoorInfo: {
      start: startIndoor,
      end: endIndoor,
      hasIndoorPoints: startIndoor.isIndoor || endIndoor.isIndoor
    }
  });
});
// --- END: ROBUST ROUTE CALCULATION LOGIC ---

// --- INDOOR DETECTION FUNCTIONS ---
function detectIndoorFromGPS(gpsData) {
  const accuracy = gpsData.accuracy || Infinity;
  const altitude = gpsData.altitude;
  const speed = gpsData.speed;
  
  // Indoor indicators:
  // - Poor GPS accuracy (>20 meters)
  // - No altitude data
  // - No speed data
  // - Rapid accuracy changes
  
  let indoorScore = 0;
  let totalChecks = 0;
  
  if (accuracy > 20) {
    indoorScore += 3; // Strong indicator
  }
  totalChecks++;
  
  if (!altitude) {
    indoorScore += 1; // No altitude often means indoor
  }
  totalChecks++;
  
  if (!speed) {
    indoorScore += 1; // No speed data
  }
  totalChecks++;
  
  return {
    isIndoor: indoorScore >= 2,
    confidence: (indoorScore / totalChecks) * 100,
    accuracy: accuracy,
    hasAltitude: !!altitude,
    hasSpeed: !!speed
  };
}

function analyzeWiFiNetworks(wifiData) {
  if (!wifiData || !wifiData.networks) {
    return { isIndoor: false, confidence: 0, reason: 'No WiFi data' };
  }
  
  const networkCount = wifiData.networks.length;
  const averageSignal = wifiData.networks.reduce((sum, net) => sum + net.signalStrength, 0) / networkCount;
  
  let indoorScore = 0;
  let totalChecks = 0;
  
  // More WiFi networks often indicate indoor location
  if (networkCount > 8) {
    indoorScore += 2;
  } else if (networkCount > 5) {
    indoorScore += 1;
  }
  totalChecks++;
  
  // Strong WiFi signals often indicate indoor
  if (averageSignal > -50) {
    indoorScore += 1;
  }
  totalChecks++;
  
  return {
    isIndoor: indoorScore >= 1,
    confidence: (indoorScore / totalChecks) * 100,
    networkCount: networkCount,
    averageSignal: averageSignal
  };
}

function analyzeCellularNetwork(cellularData) {
  if (!cellularData) {
    return { isIndoor: false, confidence: 0, reason: 'No cellular data' };
  }
  
  const signalStrength = cellularData.signalStrength || 0;
  const networkType = cellularData.networkType || 'unknown';
  const downlink = cellularData.downlink || 0;
  
  let indoorScore = 0;
  let totalChecks = 0;
  
  // Weak cellular signal often indicates indoor
  if (signalStrength < 0.3) {
    indoorScore += 2;
  } else if (signalStrength < 0.6) {
    indoorScore += 1;
  }
  totalChecks++;
  
  // Slow network types often indicate indoor
  if (networkType === 'slow-2g' || networkType === '2g') {
    indoorScore += 1;
  }
  totalChecks++;
  
  // Low downlink speed often indicates indoor
  if (downlink < 1) {
    indoorScore += 1;
  }
  totalChecks++;
  
  return {
    isIndoor: indoorScore >= 1,
    confidence: (indoorScore / totalChecks) * 100,
    signalStrength: signalStrength,
    networkType: networkType,
    downlink: downlink
  };
}

function comprehensiveIndoorDetection(locationData, deviceInfo) {
  const gpsResult = detectIndoorFromGPS(locationData);
  const wifiResult = analyzeWiFiNetworks(deviceInfo?.wifi);
  const cellularResult = analyzeCellularNetwork(deviceInfo?.cellular);
  
  let totalIndoorScore = 0;
  let totalConfidence = 0;
  let totalChecks = 0;
  
  // Weight GPS more heavily as it's most reliable
  if (gpsResult.confidence > 0) {
    totalIndoorScore += gpsResult.isIndoor ? 3 : 0;
    totalConfidence += gpsResult.confidence;
    totalChecks++;
  }
  
  if (wifiResult.confidence > 0) {
    totalIndoorScore += wifiResult.isIndoor ? 1 : 0;
    totalConfidence += wifiResult.confidence;
    totalChecks++;
  }
  
  if (cellularResult.confidence > 0) {
    totalIndoorScore += cellularResult.isIndoor ? 1 : 0;
    totalConfidence += cellularResult.confidence;
    totalChecks++;
  }
  
  const isIndoor = totalIndoorScore >= 2; // Threshold for indoor detection
  const averageConfidence = totalChecks > 0 ? totalConfidence / totalChecks : 0;
  
  return {
    isIndoor: isIndoor,
    confidence: averageConfidence,
    details: {
      gps: gpsResult,
      wifi: wifiResult,
      cellular: cellularResult
    },
    totalScore: totalIndoorScore,
    checksPerformed: totalChecks
  };
}

// --- END INDOOR DETECTION FUNCTIONS ---

// --- INDOOR DETECTION ENDPOINT ---
app.post('/detect_indoor', async (req, res) => {
  const { location, deviceInfo } = req.body;
  
  if (!location || !location.lat || !location.lng) {
    return res.status(400).json({ 
      success: false, 
      error: 'Location data (lat, lng) is required' 
    });
  }
  
  const indoorResult = comprehensiveIndoorDetection(location, deviceInfo);
  
  res.json({
    success: true,
    isIndoor: indoorResult.isIndoor,
    confidence: indoorResult.confidence,
    details: indoorResult.details,
    location: location
  });
});
// --- END INDOOR DETECTION ENDPOINT ---

app.get('/', (req, res) => res.send('Route API is running!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 