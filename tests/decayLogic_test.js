
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
  // nft.decay(rate); // 
}


function calculateHealthIndex(dataSet) {

  return dataSet.healthIndex;
}

// mock data
let testDataSets = [
  { date: "2024-01-15", healthIndex: 0.75 },
  { date: "2024-02-20", healthIndex: 0.65 },
  { date: "2024-03-25", healthIndex: 0.85 },
];

testDataSets.forEach((dataSet) => {
  updateDecayRate(dataSet);
});
