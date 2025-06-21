const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());

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

function dijkstra(graph, start, end) {
  const distances = {}, prev = {}, visited = new Set(), queue = [];
  for (const node in graph) {
    distances[node] = Infinity;
    prev[node] = null;
  }
  distances[start] = 0;
  queue.push({ node: start, dist: 0 });

  while (queue.length > 0) {
    queue.sort((a, b) => a.dist - b.dist);
    const { node: current } = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    if (current === end) break;
    const neighbors = graph[current] || [];
    for (const { node: neighbor, weight } of neighbors) {
      const alt = distances[current] + weight;
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
  return { path, distance: distances[end] };
}

app.post('/calculate_route', async (req, res) => {
  if (!graphNodes || !graphEdges) {
    return res.status(503).json({ success: false, error: 'Graph data not loaded yet.' });
  }
  const { start, end } = req.body;
  const startNode = findNearestNode(start.lat, start.lng, graphNodes);
  const endNode = findNearestNode(end.lat, end.lng, graphNodes);
  if (!startNode || !endNode) {
    return res.json({ success: false, error: 'No nearby node found.' });
  }
  const result = dijkstra(graphEdges, startNode, endNode);
  if (!result.path || result.path.length === 0) {
    return res.json({ success: false, error: 'No route found.' });
  }
  // Convert node IDs to lat/lng
  const coords = result.path.map(id => {
    const node = graphNodes.find(n => n.id === id);
    return node ? { lat: node.lat, lng: node.lng } : null;
  }).filter(Boolean);
  res.json({ success: true, route: coords });
});

app.get('/', (req, res) => res.send('Route API is running!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
