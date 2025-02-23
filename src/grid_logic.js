function make2DArray(cols, rows) {
  let arr = new Array(cols);
  for (let i = 0; i < cols; i++) {
    arr[i] = new Array(rows);
  }
  return arr;
}

function initializeGrid(cols, rows, resolution, selectedDataSet) {
  const grid = make2DArray(cols, rows);

  const dataPoints = Object.entries(selectedDataSet.labs).concat(
    Object.entries(selectedDataSet.ecg)
  );

  const healthIndex = selectedDataSet.healthIndex || 0.5;
  let dataPointIndex = 0;

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const [dataKey, dataValue] = dataPoints[dataPointIndex];
      dataPointIndex = (dataPointIndex + 1) % dataPoints.length;

      const normalizedValue = dataValue;

      grid[i][j] = {
        x: i * resolution + resolution / 2,
        y: j * resolution + resolution / 2,
        health: healthIndex * normalizedValue || 0.5,
        decayRate: selectedDataSet.decayRate * normalizedValue || 0.01,
        palette: validatePalette(generateOrganicPalette(selectedDataSet.palette)),
        dataKey: dataKey,
        dataValue: normalizedValue || 0,
      };
    }
  }
  return grid;
}
