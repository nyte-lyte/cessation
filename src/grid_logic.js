// Utility: Create a 2D array
function make2DArray(cols, rows) {
  let arr = new Array(cols);
  for (let i = 0; i < cols; i++) {
    arr[i] = new Array(rows);
  }
  return arr;
}

// Utility: Shuffle array for random data point assignment
function shuffleArray(array, enableShuffle = true) {
  if (!enableShuffle) return array;
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Validate data key for min/max values
function isValidKey(dataKey) {
  return (
    minMaxValues[dataKey] &&
    typeof minMaxValues[dataKey].min !== "undefined" &&
    typeof minMaxValues[dataKey].max !== "undefined"
  );
}

// Function to initialize the grid
function initializeGrid(cols, rows, resolution, selectedDataSet) {
  let grid = make2DArray(cols, rows);

  let dataPoints = Object.entries(selectedDataSet.labs).concat(
    Object.entries(selectedDataSet.ecg)
  );

  dataPoints = shuffleArray(dataPoints);

  let healthIndex = calculateHealthIndex(selectedDataSet);

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      let index = (i * rows + j) % dataPoints.length;
      let [dataKey, dataValue] = dataPoints[index];

      if (!isValidKey(dataKey)) {
        if (DEBUG) {
          console.warn(
            `Skipping cell (${i}, ${j}) due to invalid min/max for key: ${dataKey}`
          );
        }
        grid[i][j] = null;
        continue;
      }

      let normalizedValue = normalize(
        dataValue,
        minMaxValues[dataKey].min,
        minMaxValues[dataKey].max
      );

      let group = Math.floor(normalizedValue * 10);

      grid[i][j] = {
        x: i * resolution + resolution / 2,
        y: j * resolution + resolution / 2,
        health: healthIndex * normalizedValue || 0.5,
        decayRate: selectedDataSet.decayRate * normalizedValue || 0.01,
        palette: selectedDataSet.palette,
        dataKey: dataKey,
        dataValue: normalizedValue || 0,
        group: group,
      };

      if (DEBUG) {
        console.log(
          `Cell initialized at (${i}, ${j}):`,
          `Health: ${grid[i][j]?.health}, DecayRate: ${grid[i][j]?.decayRate}, Group: ${grid[i][j]?.group}`
        );
      }
    }
  }

  return grid;
}
