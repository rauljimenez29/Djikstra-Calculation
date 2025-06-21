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
    graphNodes = await nodesRes.json();
    graphEdges = await edgesRes.json();
    console.log('Graph data loaded from Google Drive!');

    // Add these logs:
    console.log('graphNodes type:', typeof graphNodes, Array.isArray(graphNodes));
    console.log('graphNodes sample:', graphNodes && graphNodes.slice ? graphNodes.slice(0, 2) : graphNodes);
    console.log('graphEdges type:', typeof graphEdges, Array.isArray(graphEdges));
    console.log('graphEdges sample:', graphEdges && Object.keys(graphEdges).length ? Object.keys(graphEdges).slice(0, 2) : graphEdges);

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

function findNearestNode(lat, lng, nodes) {
  let minDist = Infinity, nearest = null;
  for (const node of nodes) {
    const dist = haversine(node.lat, node.lng, lat, lng);
    if (dist < minDist) {
      minDist = dist;
      nearest = node.id;
    }
  }
  return nearest;
}

// --- CORRECTED DIJKSTRA FUNCTION ---
function dijkstra(graph, start, end) {
  // This logic is adapted from the working client-side fallback.
  if (start === end) {
    return { path: [start], distance: 0 };
  }

  const distances = {}, prev = {}, visited = new Set(), queue = [];

  // CORRECT INITIALIZATION: Loop over the graph keys, just like the client.
  // This ensures all nodes that are part of any edge are included.
  for (const node in graph) {
    distances[node] = Infinity;
    prev[node] = null;
  }
  
  // Also add nodes that might be destinations but not origins
  for (const node in graph) {
    for (const edge of graph[node]) {
      if (distances[edge.node] === undefined) {
        distances[edge.node] = Infinity;
        prev[edge.node] = null;
      }
    }
  }

  // Check if start node is valid before proceeding
  if (distances[start] === undefined) {
    console.error("Start node not found in graph.");
    return { path: [], distance: Infinity };
  }
  
  distances[start] = 0;
  queue.push({ node: start, dist: 0 });

  while (queue.length > 0) {
    queue.sort((a, b) => a.dist - b.dist);
    const { node: current } = queue.shift();
    if (!current || visited.has(current)) continue;

    visited.add(current);
    if (current === end) break;
    
    const neighbors = graph[current] || [];
    for (const { node: neighbor, weight } of neighbors) {
      const alt = distances[current] + weight;
      if (distances[neighbor] === undefined) { 
        // This handles destination-only nodes that weren't in the initial keys
        distances[neighbor] = Infinity;
      }
      if (alt < distances[neighbor]) {
        distances[neighbor] = alt;
        prev[neighbor] = current;
        queue.push({ node: neighbor, dist: alt });
      }
    }
  }
  
  // Reconstruct path
  const path = [];
  let u = end;
  
  if (prev[u] !== null || u === start) {
    while (u) {
      path.unshift(u);
      u = prev[u];
    }
  }

  if (path[0] !== start) {
    return { path: [], distance: Infinity };
  }

  return { path, distance: distances[end] };
}

app.post('/calculate_route', async (req, res) => {
  if (!graphNodes || !graphEdges) {
    return res.status(503).json({ success: false, error: 'Graph data not loaded yet.' });
  }
  const { start, end } = req.body;
  const startNode = findNearestNode(start.lat, start.lng, graphNodes);
  const endNode = findNearestNode(end.lat, end.lng, graphNodes);

  // Add these logs:
  console.log('Start coordinates:', start);
  console.log('End coordinates:', end);
  console.log('Start node:', startNode);
  console.log('End node:', endNode);

  if (!startNode || !endNode) {
    console.log('No nearby node found for start or end.');
    return res.json({ success: false, error: 'No nearby node found.' });
  }

  const result = dijkstra(graphEdges, startNode, endNode);

  // Log the Dijkstra result
  console.log('Dijkstra result:', result);

  if (!result.path || result.path.length <= 1) { // Changed to <= 1 to handle single-node paths
    console.log('No valid route found by Dijkstra.');
    return res.json({ success: false, error: 'No route found.' });
  }
  // Convert node IDs to lat/lng
  const coords = result.path.map(id => {
    const node = graphNodes.find(n => n.id === id);
    return node ? { lat: node.lat, lng: node.lng } : null;
  }).filter(Boolean);

  // Log the final coordinates
  console.log('Route coordinates:', coords.length);

  res.json({ success: true, route: coords });
});

app.get('/', (req, res) => res.send('Route API is running!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
