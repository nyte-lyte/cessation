function generateOrganicPalette(dataSet) {
  let healthIndex = calculateHealthIndex(dataSet);

  let startHue = map(
    dataSet.labs.glucose,
    minMaxValues.glucose.min,
    minMaxValues.glucose.max,
    30,
    300
  );
  let endHue = map(
    dataSet.ecg.qtcInterval,
    minMaxValues.qtcInterval.min,
    minMaxValues.qtcInterval.max,
    40,
    320
  );

  let saturation = map(healthIndex, 0, 1, 30, 70);
  let brightnessStart = map(healthIndex, 0, 1, 50, 80);
  let brightnessEnd = map(healthIndex, 0, 1, 20, 50);

  let startColor = color(startHue, saturation, brightnessStart);
  let endColor = color(endHue, saturation, brightnessEnd);

  return { start: startColor, end: endColor };
}

function validatePalette(palette) {
  if (!palette || !palette.start || !palette.end) {
    return { start: color(0, 40, 40), end: color(0, 0, 10) };
  }
  return palette;
}
