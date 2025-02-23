// Initialize movement properties for a grid cell
function initializeMovement(cell, selectedDataSet) {
  const ecg = selectedDataSet.ecg;

  cell.speed = ecg.ventRate * 0.01;
  cell.direction = ecg.prInterval * TWO_PI;
  cell.speedModulation = ecg.qrsInterval;
  cell.noiseOffset = random(1000);

  cell.velocity = {
    x: cell.speed * cos(cell.direction),
    y: cell.speed * sin(cell.direction),
  };
}

// Update movement for a single cell
function updateMovement(cell) {
  if (!cell) return;

  let noiseFactor = noise(cell.noiseOffset) - 0.5;
  cell.noiseOffset += 0.01;

  cell.direction += noiseFactor * 0.2;
  cell.speed += cell.speedModulation * 0.001 * random([-1, 1]);
  cell.speed = max(cell.speed, 0.01);

  cell.velocity.x = cell.speed * cos(cell.direction);
  cell.velocity.y = cell.speed * sin(cell.direction);

  cell.x += cell.velocity.x * 0.05;
  cell.y += cell.velocity.y * 0.05;

  //console.log(`Cell moved to: (${cell.x}, ${cell.y})`);

  cell.x = (cell.x + width) % width;
  cell.y = (cell.y + height) % height;
}

// Assign movement to the grid
function assignMovementToGrid(grid, selectedDataSet) {
  for (let row of grid) {
    for (let cell of row) {
      if (cell) initializeMovement(cell, selectedDataSet);
    }
  }
}

// Update movement across the grid
function updateGridMovement(grid) {
  if (!Array.isArray(grid) || !Array.isArray(grid[0])) return;

  for (const row of grid) {
    for (const cell of row) {
      if (cell) updateMovement(cell);
    }
  }
}
