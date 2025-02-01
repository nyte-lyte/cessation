// Initialize movement properties for a grid cell
function initializeMovement(cell, selectedDataSet) {
  const ecg = selectedDataSet.ecg;

  // Use ECG data for initial properties
  cell.speed = ecg.ventRate * 0.01; // Speed directly from ventRate
  cell.direction = ecg.prInterval * TWO_PI; // Initial direction based on PR interval
  cell.clusterAttraction = ecg.qtcInterval * 0.001; // Clustering tendency from QTc interval
  cell.speedModulation = ecg.qrsInterval; // Modulates speed changes
  cell.noiseOffset = random(1000);

  cell.angularMovement = {
    pAxis: ecg.pAxis,
    rAxis: ecg.rAxis,
    tAxis: ecg.tAxis,
  };

  // Derived velocity
  cell.velocity = {
    x: cell.speed * cos(cell.direction),
    y: cell.speed * sin(cell.direction),
  };
}

function getNeighborCells(grid, targetCell) {
  if (!Array.isArray(grid) || !Array.isArray(grid[0])) {
    console.error("Invalid grid passed to getNeighborCells:", grid);
    return []; // Fix return statement (proper scope)
  }

  if (
    !targetCell ||
    typeof targetCell.x !== "number" ||
    typeof targetCell.y !== "number"
  ) {
    console.error("Invalid targetCell passed to getNeighborCells:", targetCell);
    return []; // Fix return statement (proper scope)
  }

  const neighbors = [];
  const range = resolution * 1.5; // Define the distance to consider as "neighbors"

  for (let row of grid) {
    for (let cell of row) {
      if (cell && cell !== targetCell) {
        const distance = dist(targetCell.x, targetCell.y, cell.x, cell.y);
        if (distance < range) {
          neighbors.push(cell);
        }
      }
    }
  }
  return neighbors;
}


// Update movement for a single cell
function updateMovement(cell, clusterCenters, grid) {
  if (!cell || typeof cell.group === "undefined") {
    console.error("Invalid cell passed to updateMovement:", cell);
    return;
  }

  const groupCenter = clusterCenters[cell.group];

  if (!groupCenter) return; // Skip if no valid group center

  const neighbors = getNeighborCells(grid, cell);

  // Add noise for organic movement
  let noiseFactor = noise(cell.noiseOffset) - 0.5;
  cell.noiseOffset += 0.01;

  // Adjust direction with noise and angular influence
  let angleAdjustment =
    (cell.angularMovement.pAxis - cell.angularMovement.tAxis) * 0.005;
  cell.direction += angleAdjustment + noiseFactor * 0.2;

  // Modulate speed
  cell.speed += cell.speedModulation * 0.001 * random([-1, 1]);
  cell.speed = max(cell.speed, 0.01); // Clamp speed to prevent negative values

  // Recalculate velocity
  cell.velocity.x = cell.speed * cos(cell.direction);
  cell.velocity.y = cell.speed * sin(cell.direction);

  // Clustering force with distance-sensitive adjustment
  const distanceToCenter = dist(cell.x, cell.y, groupCenter.x, groupCenter.y);
  if (distanceToCenter > resolution * 2) {
    const clusteringForce = 0.001 * (1 / distanceToCenter); // Weaker pull at greater distances
    cell.x += clusteringForce * (groupCenter.x - cell.x);
    cell.y += clusteringForce * (groupCenter.y - cell.y);
  }

  // Repulsion among neighbors
  for (let neighbor of neighbors) {
    const dx = cell.x - neighbor.x;
    const dy = cell.y - neighbor.y;
    const distance = sqrt(dx * dx + dy * dy);

    if (distance < resolution) {
      const repulsionForce = 0.01 / distance; // Stronger repulsion when closer
      cell.x += dx * repulsionForce;
      cell.y += dy * repulsionForce;
    }
  }

  // Apply velocity
  cell.x += cell.velocity.x * 0.05;
  cell.y += cell.velocity.y * 0.05;

  // Wrap-around boundaries
  cell.x = (cell.x + width) % width;
  cell.y = (cell.y + height) % height;
}

// Assign movement to the grid
function assignMovementToGrid(grid, selectedDataSet) {
  for (let row of grid) {
    for (let cell of row) {
      if (cell) {
        initializeMovement(cell, selectedDataSet);
      }
    }
  }
}

// Update movement across the grid
function updateGridMovement(grid) {
  if (!Array.isArray(grid) || !Array.isArray(grid[0])) {
    console.error("Invalid grid structure", grid);
    return;
  }

  const clusterCenters = calculateClusterCenters(grid);
  console.log("Cluster centers:", clusterCenters);

  for (const row of grid) {
    for (const cell of row) {
      if (cell) {
        // Validate cell properties
        if (
          typeof cell.x !== "number" ||
          typeof cell.y !== "number" ||
          typeof cell.group === "undefined"
        ) {
          console.error("Invalid cell properties:", cell);
          continue; // Skip invalid cells
        }

        updateMovement(cell, clusterCenters, grid);
      }
    }
  }
}

// Calculate cluster centers dynamically
 export function calculateClusterCenters(grid) {
  if (!Array.isArray(grid) || !Array.isArray(grid[0])) {
    console.error("Invalid grid structure:", grid);
    return{};
  }

  const clusterCenters = {};

  for (const row of grid) {
    for (const cell of row) {
      if (cell) {
        const group = cell.group;
        if (!clusterCenters[group]) {
          clusterCenters[group] = { x: 0, y: 0, count: 0 };
        }
        clusterCenters[group].x += cell.x;
        clusterCenters[group].y += cell.y;
        clusterCenters[group].count++;
      }
    }
  }

  // Average cluster centers
  for (const group in clusterCenters) {
    if (clusterCenters[group].count > 0) {
      clusterCenters[group].x /= clusterCenters[group].count;
      clusterCenters[group].y /= clusterCenters[group].count;
    }
  }

  return clusterCenters;
}
