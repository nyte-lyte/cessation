let baseDecayRate = 0.01;

function updateDecayRate(dataSet) {
  let healthIndex = calculateHealthIndex(dataSet);

  let adjustedDecayRate = baseDecayRate * (1 + (1 - healthIndex));

  if (adjustedDecayRate < baseDecayRate) {
    adjustedDecayRate = baseDecayRate;
  }

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
