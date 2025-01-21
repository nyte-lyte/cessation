// Initialize movement properties for a grid cell
function initializeMovement(cell, selectedDataSet) {
  const ecg = selectedDataSet.ecg;

  // Use ECG data for initial properties
  cell.speed = ecg.ventRate * 0.01; // Speed directly from ventRate
  cell.direction = ecg.prInterval * TWO_PI; // Add slight variability
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

  // Normalize initial velocity to prevent collective drift
  let magnitude = sqrt(cell.velocity.x ** 2 + cell.velocity.y ** 2);
  if (magnitude > 0) {
    cell.velocity.x /= magnitude;
    cell.velocity.y /= magnitude;
  }

  // Scale velocity by speed
  cell.velocity.x *= cell.speed * 0.01;
  cell.velocity.y *= cell.speed * 0.01;
}

function updateMovement(cell) {
  // Evolve noise offset uniquely
  let noiseFactor = noise(cell.noiseOffset) - 0.5; // Noise in range [-0.5, 0.5]
  cell.noiseOffset += 0.01; // Increment noise offset per frame

  // Adjust direction
  let angleAdjustment =
    (cell.angularMovement.pAxis - cell.angularMovement.tAxis) * 0.005;
  cell.direction += angleAdjustment + noiseFactor * 0.2; // Add noise influence

  // Modulate speed
  cell.speed += (cell.speedModulation || 0) * 0.001 * random([-1, 1]);

  // Recalculate velocity
  cell.velocity.x = cell.speed * cos(cell.direction);
  cell.velocity.y = cell.speed * sin(cell.direction);

  // Clustering force with subtle scaling
  let clusteringForce = map(cell.clusterAttraction, 0, 1, -0.05, 0.05);

  // Apply movement
  cell.x += (cell.velocity.x + clusteringForce) * 0.1;
  cell.y += (cell.velocity.y + clusteringForce) * 0.1;

  // Wrap-around boundaries
  cell.x = (cell.x + width) % width;
  cell.y = (cell.y + height) % height;
}

// Assign initial movement properties to the grid
function assignMovementToGrid(grid, selectedDataSet) {
  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      let cell = grid[i][j];
      if (cell) {
        initializeMovement(cell, selectedDataSet);
      }
    }
  }
}

// Balance initial forces across the grid
function balanceInitialForces(grid) {
  let totalVelocity = { x: 0, y: 0 };
  let cellCount = 0;

  // Calculate total velocity
  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      let cell = grid[i][j];
      if (cell) {
        totalVelocity.x += cell.velocity.x;
        totalVelocity.y += cell.velocity.y;
        cellCount++;
      }
    }
  }

  // Compute average velocity
  totalVelocity.x /= cellCount;
  totalVelocity.y /= cellCount;

  // Subtract average velocity from each cell
  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      let cell = grid[i][j];
      if (cell) {
        cell.velocity.x -= totalVelocity.x;
        cell.velocity.y -= totalVelocity.y;
      }
    }
  }
}

// Update movement across the grid
function updateGridMovement(grid) {
  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      let cell = grid[i][j];
      if (cell) {
        updateMovement(cell);
      }
    }
  }
}
