//import { calculateClusterCenters }from "./movement_logic";

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
    console.error("Grid initialization failed:", grid);
    noLoop(); // Stop the sketch if the grid fails to initialize
    return;
  }

  console.log("Initialized grid:", grid);

  // Calculate cluster centers
  const clusterCenters = calculateClusterCenters(grid);
  console.log("Cluster centers:", clusterCenters);

  // Assign movement properties
  assignMovementToGrid(grid, selectedDataSet);
}


function draw() {
  background(0); // Clear the canvas

  // Update movement for all cells in the grid
  updateGridMovement(grid);

  // Loop through the grid to draw each cell
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      let cell = grid[i][j];
      if (!cell) continue; // Skip invalid cells

      if (cell.health > 0) {
        // Determine the color based on health
        let blendedColor = lerpColor(
          cell.palette.start,
          cell.palette.end,
          1 - cell.health
        );
        fill(blendedColor);
        noStroke();

        // Draw the organic blob for the cell
        drawOrganicBlob(cell);
        
        // Apply decay to the cell's health
        cell.health -= cell.decayRate * 0.0001;
        if (cell.health < 0) cell.health = 0;
      } else {
        // If the cell has "died," draw a placeholder or nothing
        fill(0);
        noStroke();
        ellipse(cell.x, cell.y, resolution * 0.8); // Placeholder for dead cells
      }
    }
  }

  // Update the animation time for organic forms
  updateBlobTime(); 
}
