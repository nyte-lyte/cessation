let grid;
let cols, rows;
let resolution = 20;
let selectedDataSet;
let DEBUG = true; // Set to false to disable logs

function setup() {
  createCanvas(600, 600);
  colorMode(HSB, 360, 100, 100);

  cols = floor(width / resolution);
  rows = floor(height / resolution);

  // Select a dataset
  selectedDataSet = healthDataSets[3]; // Change index to test other datasets
  if (DEBUG) console.log(`Using dataset for date: ${selectedDataSet.date}`);

  selectedDataSet.palette = validatePalette(
    generateOrganicPalette(selectedDataSet)
  );

  if (!selectedDataSet.palette) {
    console.error("Failed to generate a palette. Using default.");
    selectedDataSet.palette = {
      start: color(60, 100, 100),
      end: color(0, 100, 100),
    };
  }

  if (DEBUG) console.log("Assigned palette:", selectedDataSet.palette);

  // Initialize the grid
  grid = initializeGrid(cols, rows, resolution, selectedDataSet);

  // Assign movement properties to the grid
  assignMovementToGrid(grid, selectedDataSet);
}

function draw() {
  background(0);

  // Update grid movement
  updateGridMovement(grid);

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      let cell = grid[i][j];
      if (!cell) continue; // Skip invalid cells

      if (cell.health > 0) {
        let blendedColor = lerpColor(
          cell.palette.start,
          cell.palette.end,
          1 - cell.health
        );
        fill(blendedColor);
        noStroke();
        ellipse(cell.x, cell.y, resolution * 0.8); // Changed to ellipse for movement clarity

        // Apply decay
        cell.health -= cell.decayRate * 0.0001;
        if (cell.health < 0) cell.health = 0;
      } else {
        fill(0);
        noStroke();
        ellipse(cell.x, cell.y, resolution * 0.8);
      }
    }
  }
}
