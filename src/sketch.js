let grid;
let cols, rows;
let resolution = 20;
let selectedDataSet;
let DEBUG = true; // Set to false to disable logs

function setup() {
  let canvas = createCanvas(800, 800);
  canvas.parent("canvas-container");
  colorMode(HSB, 360, 100, 100);

  cols = floor(width / resolution);
  rows = floor(height / resolution);

  // Select a dataset
  selectedDataSet = healthDataSets[10];
  if (DEBUG) console.log(`Using dataset for date: ${selectedDataSet.date}`);
console.log("🔍 Selected dataset before palette generation:", selectedDataSet);
  selectedDataSet.palette = validatePalette(
    generateOrganicPalette(selectedDataSet)
  ) || {
    start: color(60, 100, 100),
    end: color(0, 100, 100),
  };

  if (DEBUG) console.log("Assigned palette:", selectedDataSet.palette);

  // Initialize the grid
  grid = initializeGrid(cols, rows, resolution, selectedDataSet);

  if (!grid || !Array.isArray(grid)) {
    console.error("❌ Grid initialization failed:", grid);
    noLoop(); // Stop the sketch if the grid fails to initialize
    return;
  }

 

  // Assign movement properties
  assignMovementToGrid(grid, selectedDataSet);
}

function draw() {
  background(0);
  
  // Ensure grid exists before trying to update it
  if (!grid || !Array.isArray(grid)) return;

  updateGridMovement(grid);

  // Draw each cell
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      let cell = grid[i][j];
      if (!cell) continue;

       // 🔹 **Log to check if the cell is being processed**
      //console.log(`Drawing cell at (${cell.x}, ${cell.y}) with health: ${cell.health}`);

      if (cell.health > 0) {
        // 🔹 **Log to check if colors are applied correctly**
        //console.log(`Blended color: ${cell.palette.start} to ${cell.palette.end}`);

      if (cell.health > 0) {
        let blendedColor = lerpColor(
          cell.palette.start,
          cell.palette.end,
          1 - cell.health
        );
        fill(blendedColor);
        noStroke();

        drawOrganicBlob(cell);

        // Apply decay to the cell's health
        cell.health -= cell.decayRate * 0.001;
        if (cell.health < 0) cell.health = 0;
      } else {
        fill(0);
        noStroke();
        ellipse(cell.x, cell.y, resolution * 0.8);
      }
    }
  }

  updateBlobTime();
}
}