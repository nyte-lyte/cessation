function make2DArray(cols, rows) {
  let arr = new Array(cols);
  for (let i = 0; i < cols; i++) {
    arr[i] = new Array(rows);
  }
  return arr;
}

// Function to generate randomized cluster centers within overlapping zones
function generateClusterCenters(groupCount, canvasWidth, canvasHeight) {
  let clusterCenters = {};

  // Define overlapping zones by splitting the canvas
  const zoneWidth = (canvasWidth / Math.sqrt(groupCount)) * 1.2; // Slightly larger for overlap
  const zoneHeight = (canvasHeight / Math.sqrt(groupCount)) * 1.2;

  let groupIndex = 0;
  for (let x = 0; x < Math.sqrt(groupCount); x++) {
    for (let y = 0; y < Math.sqrt(groupCount); y++) {
      if (groupIndex < groupCount) {
        clusterCenters[groupIndex] = {
          x: random(x * zoneWidth, (x + 1) * zoneWidth),
          y: random(y * zoneHeight, (y + 1) * zoneHeight),
        };
        groupIndex++;
      }
    }
  }

  return clusterCenters;
}

// Function to initialize the grid
function initializeGrid(cols, rows, resolution, selectedDataSet) {
  const grid = make2DArray(cols, rows);

  const dataPoints = Object.entries(selectedDataSet.labs).concat(
    Object.entries(selectedDataSet.ecg)
  );

  const healthIndex = selectedDataSet.healthIndex || 0.5;

  let dataPointIndex = 0;

  // Generate cluster centers dynamically
  const clusterCenters = generateClusterCenters(10, width, height); // 10 groups for now

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      // Cycle through data points
      const [dataKey, dataValue] = dataPoints[dataPointIndex];
      dataPointIndex = (dataPointIndex + 1) % dataPoints.length;

      // Assign cell properties
      const normalizedValue = dataValue; // Data is already normalized
      const group = Math.floor(normalizedValue * 10); // Assign group based on value

      grid[i][j] = {
        x: i * resolution + resolution / 2,
        y: j * resolution + resolution / 2,
        health: healthIndex * normalizedValue || 0.5,
        decayRate: selectedDataSet.decayRate * normalizedValue || 0.01,
        palette: selectedDataSet.palette, // Palette assignment
        dataKey: dataKey,
        dataValue: normalizedValue || 0,
        group: group,
        
      };
    }
  }

  return grid; 
}
