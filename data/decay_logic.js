let baseDecayRate = 0.1;

function updateDecayRate(dataSet) {
    let healthIndex = calculateHealthIndex(dataSet);

    let adjustedDecayRate = baseDecayRate * (1 + (1 - healthIndex));

    if (adjustedDecayRate < baseDecayRate) {
        adjustedDecayRate = baseDecayRate;
    }

    applyDecay(adjustedDecayRate);
}

function applyDecay(rate) {

    console.log('Applying decay at rate: ${rate}');
}
