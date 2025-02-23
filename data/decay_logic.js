let baseDecayRate = 0.01;

function calculateDynamicBaseDecayRate(dataSet) {
  let normalizedQTc = normalize(
    dataSet.ecg.qtcInterval,
    minMaxValues.qtcInterval.min,
    minMaxValues.qtcInterval.max
  );
  let normalizedCreatinine = normalize(
    dataSet.labs.creatinine,
    minMaxValues.creatinine.min,
    minMaxValues.creatinine.max
  );
  let normalizedEGFR = normalize(
    dataSet.labs.eGFR,
    minMaxValues.eGFR.min,
    minMaxValues.eGFR.max
  );
  let normalizedGlucose = normalize(
    dataSet.labs.glucose,
    minMaxValues.glucose.min,
    minMaxValues.glucose.max
  );

  let weightQTc = 0.4;
  let weightCreatinine = 0.3;
  let weightEGFR = 0.2;
  let weightGlucose = 0.1;

  let dynamicBaseDecayRate =
    normalizedQTc * weightQTc +
    normalizedCreatinine * weightCreatinine +
    (1 - normalizedEGFR) * weightEGFR +
    normalizedGlucose * weightGlucose;

  return dynamicBaseDecayRate;
}

function updateDecayRate(dataSet) {
  let dynamicBaseDecayRate = calculateDynamicBaseDecayRate(dataSet);

  let healthIndex = calculateHealthIndex(dataSet);

  let adjustedDecayRate = dynamicBaseDecayRate * (1 + (1 - healthIndex));

  if (adjustedDecayRate < dynamicBaseDecayRate) {
    adjustedDecayRate = dynamicBaseDecayRate;
  }

  dataSet.decayRate = adjustedDecayRate;

  console.log(
    `Date: ${dataSet.date}, Health Index: ${healthIndex}, Decay Rate: ${adjustedDecayRate}`
  );

  applyDecay(adjustedDecayRate);
}

function applyDecay(rate) {
  console.log(`Applying decay at rate: ${rate}`);
}

healthDataSets.forEach((dataSet) => {
  updateDecayRate(dataSet);
});

console.log("Updated healthDataSets with decay rates:", healthDataSets);
