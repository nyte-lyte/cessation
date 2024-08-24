let healthDataSets = [
  {
    date: "2018-07-16",
    ecg: {
      ventRate: 65,
      prInterval: 166,
      qrsInterval: 82,
      qtInterval: 412,
      qtcInterval: 428,
      pAxis: 77,
      rAxis: 86,
      tAxis: 78,
    },
    labs: {
      glucose: 127,
      nitrogen: 20,
      creatinine: 0.62,
      eGFR: 115,
      sodium: 138,
      potassium: 4.1,
      chloride: 104,
      carbonDioxide: 24,
      calcium: 9.2,
    },
  },
  {
    date: "2018-10-04",
    ecg: {
      ventRate: 60,
      prInterval: 158,
      qrsInterval: 85,
      qtInterval: 428,
      qtcInterval: 428,
      pAxis: 49,
      rAxis: 76,
      tAxis: 58,
    },
    labs: {
      glucose: 105,
      nitrogen: 16,
      creatinine: 0.58,
      eGFR: 118,
      sodium: 140,
      potassium: 4.1,
      chloride: 107,
      carbonDioxide: 25,
      calcium: 9.1,
    },
  },
  {
    date: "2019-01-24",
    ecg: {
      ventRate: 60,
      prInterval: 152,
      qrsInterval: 86,
      qtInterval: 404,
      qtcInterval: 404,
      pAxis: 64,
      rAxis: 72,
      tAxis: 46,
    },
    labs: {
      glucose: 104,
      nitrogen: 16,
      creatinine: 0.64,
      eGFR: 114,
      sodium: 140,
      potassium: 4.1,
      chloride: 105,
      carbonDioxide: 27,
      calcium: 9.4,
    },
  },
  {
    date: "2019-04-24",
    ecg: {
      ventRate: 63,
      prInterval: 149,
      qrsInterval: 72,
      qtInterval: 417,
      qtcInterval: 427,
      pAxis: 62,
      rAxis: 72,
      tAxis: 42,
    },
    labs: {
      glucose: 103,
      nitrogen: 15,
      creatinine: 0.63,
      eGFR: 115,
      sodium: 139,
      potassium: 4.4,
      chloride: 104,
      carbonDioxide: 26,
      calcium: 9.2,
    },
  },
  {
    date: "2019-07-31",
    ecg: {
      ventRate: 59,
      prInterval: 166,
      qrsInterval: 80,
      qtInterval: 412,
      qtcInterval: 408,
      pAxis: 61,
      rAxis: 77,
      tAxis: 48,
    },
    labs: {
      glucose: 105,
      nitrogen: 15,
      creatinine: 0.57,
      eGFR: 118,
      sodium: 139,
      potassium: 4.5,
      chloride: 105,
      carbonDioxide: 26,
      calcium: 9.3,
    },
  },
  {
    date: "2020-02-07",
    ecg: {
      ventRate: 78,
      prInterval: 164,
      qrsInterval: 85,
      qtInterval: 383,
      qtcInterval: 436,
      pAxis: 74,
      rAxis: 98,
      tAxis: 65,
    },
    labs: {
      glucose: 124,
      nitrogen: 17,
      creatinine: 0.69,
      eGFR: 110,
      sodium: 138,
      potassium: 4.2,
      chloride: 107,
      carbonDioxide: 24,
      calcium: 8.8,
    },
  },
  {
    date: "2020-05-22",
    ecg: {
      ventRate: 70,
      prInterval: 166,
      qrsInterval: 88,
      qtInterval: 370,
      qtcInterval: 399,
      pAxis: 69,
      rAxis: 79,
      tAxis: 51,
    },
    labs: {
      glucose: 117,
      nitrogen: 15,
      creatinine: 0.75,
      eGFR: 101,
      sodium: 140,
      potassium: 4.2,
      chloride: 107,
      carbonDioxide: 26,
      calcium: 9.6,
    },
  },
  {
    date: "2020-08-11",
    ecg: {
      ventRate: 75,
      prInterval: 164,
      qrsInterval: 86,
      qtInterval: 389,
      qtcInterval: 434,
      pAxis: 61,
      rAxis: 81,
      tAxis: 50,
    },
    labs: {
      glucose: 127,
      nitrogen: 17,
      creatinine: 0.75,
      eGFR: 100,
      sodium: 140,
      potassium: 3.7,
      chloride: 108,
      carbonDioxide: 22,
      calcium: 9.3,
    },
  },
  {
    date: "2020-11-12",
    ecg: {
      ventRate: 83,
      prInterval: 147,
      qrsInterval: 84,
      qtInterval: 372,
      qtcInterval: 437,
      pAxis: 48,
      rAxis: 70,
      tAxis: 31,
    },
    labs: {
      glucose: 118,
      nitrogen: 16,
      creatinine: 0.69,
      eGFR: 110,
      sodium: 137,
      potassium: 4.3,
      chloride: 106,
      carbonDioxide: 23,
      calcium: 9.4,
    },
  },
  {
    date: "2021-02-24",
    ecg: {
      ventRate: 64,
      prInterval: 168,
      qrsInterval: 94,
      qtInterval: 413,
      qtcInterval: 426,
      pAxis: 68,
      rAxis: 89,
      tAxis: 43,
    },
    labs: {
      glucose: 103,
      nitrogen: 14,
      creatinine: 0.79,
      eGFR: 94,
      sodium: 139,
      potassium: 4.5,
      chloride: 106,
      carbonDioxide: 24,
      calcium: 9.4,
    },
  },
  {
    date: "2021-09-01",
    ecg: {
      ventRate: 67,
      prInterval: 149,
      qrsInterval: 80,
      qtInterval: 388,
      qtcInterval: 410,
      pAxis: 66,
      rAxis: 77,
      tAxis: 49,
    },
    labs: {
      glucose: 117,
      nitrogen: 9,
      creatinine: 0.62,
      eGFR: 113,
      sodium: 140,
      potassium: 4.4,
      chloride: 107,
      carbonDioxide: 22,
      calcium: 9.4,
    },
  },
  {
    date: "2021-12-01",
    ecg: {
      ventRate: 67,
      prInterval: 150,
      qrsInterval: 83,
      qtInterval: 386,
      qtcInterval: 402,
      pAxis: 54,
      rAxis: 70,
      tAxis: 31,
    },
    labs: {
      glucose: 120,
      nitrogen: 11,
      creatinine: 0.72,
      eGFR: 105,
      sodium: 138,
      potassium: 4.2,
      chloride: 105,
      carbonDioxide: 22,
      calcium: 9.5,
    },
  },
  {
    date: "2022-02-14",
    ecg: {
      ventRate: 69,
      prInterval: 166,
      qrsInterval: 87,
      qtInterval: 385,
      qtcInterval: 404,
      pAxis: 59,
      rAxis: 68,
      tAxis: 30,
    },
    labs: {
      glucose: 129,
      nitrogen: 12,
      creatinine: 0.69,
      eGFR: 109,
      sodium: 142,
      potassium: 3.9,
      chloride: 109,
      carbonDioxide: 23,
      calcium: 9.0,
    },
  },
  {
    date: "2022-05-13",
    ecg: {
      ventRate: 63,
      prInterval: 156,
      qrsInterval: 85,
      qtInterval: 404,
      qtcInterval: 411,
      pAxis: 65,
      rAxis: 75,
      tAxis: 47,
    },
    labs: {
      glucose: 160,
      nitrogen: 11,
      creatinine: 0.76,
      eGFR: 98,
      sodium: 139,
      potassium: 4.1,
      chloride: 105,
      carbonDioxide: 24,
      calcium: 9.4,
    },
  },
  {
    date: "2022-08-25",
    ecg: {
      ventRate: 59,
      prInterval: 141,
      qrsInterval: 81,
      qtInterval: 436,
      qtcInterval: 435,
      pAxis: 48,
      rAxis: 69,
      tAxis: 41,
    },
    labs: {
      glucose: 112,
      nitrogen: 13,
      creatinine: 0.68,
      eGFR: 112,
      sodium: 139,
      potassium: 4.5,
      chloride: 108,
      carbonDioxide: 24,
      calcium: 9.4,
    },
  },
  {
    date: "2023-06-12",
    ecg: {
      ventRate: 57,
      prInterval: 161,
      qrsInterval: 85,
      qtInterval: 420,
      qtcInterval: 414,
      pAxis: 76,
      rAxis: 90,
      tAxis: 76,
    },
    labs: {
      glucose: 118,
      nitrogen: 14,
      creatinine: 0.6,
      eGFR: 115,
      sodium: 137,
      potassium: 3.7,
      chloride: 106,
      carbonDioxide: 26,
      calcium: 8.9,
    },
  },
  {
    date: "2023-09-05",
    ecg: {
      ventRate: 58,
      prInterval: 149,
      qrsInterval: 90,
      qtInterval: 427,
      qtcInterval: 424,
      pAxis: 69,
      rAxis: 88,
      tAxis: 60,
    },
    labs: {
      glucose: 116,
      nitrogen: 12,
      creatinine: 0.55,
      eGFR: 117,
      sodium: 142,
      potassium: 4.0,
      chloride: 113,
      carbonDioxide: 20,
      calcium: 9.2,
    },
  },
  {
    date: "2023-12-05",
    ecg: {
      ventRate: 54,
      prInterval: 153,
      qrsInterval: 83,
      qtInterval: 420,
      qtcInterval: 407,
      pAxis: 52,
      rAxis: 72,
      tAxis: 47,
    },
    labs: {
      glucose: 115,
      nitrogen: 14,
      creatinine: 0.58,
      eGFR: 116,
      sodium: 138,
      potassium: 4.1,
      chloride: 107,
      carbonDioxide: 22,
      calcium: 9.1,
    },
  },
  {
    date: "2024-02-05",
    ecg: {
      ventRate: 52,
      prInterval: 150,
      qrsInterval: 86,
      qtInterval: 453,
      qtcInterval: 433,
      pAxis: 72,
      rAxis: 69,
      tAxis: 55,
    },
    labs: {
      glucose: 117,
      nitrogen: 19,
      creatinine: 0.61,
      eGFR: 114,
      sodium: 139,
      potassium: 4.1,
      chloride: 110,
      carbonDioxide: 23,
      calcium: 9.1,
    },
  },
  {
    date: "2024-06-10",
    ecg: {
      ventRate: 57,
      prInterval: 152,
      qrsInterval: 85,
      qtInterval: 414,
      qtcInterval: 408,
      pAxis: 71,
      rAxis: 86,
      tAxis: 56,
    },
    labs: {
      glucose: 97,
      nitrogen: 12,
      creatinine: 0.66,
      eGFR: 112,
      sodium: 138,
      potassium: 4.1,
      chloride: 105,
      carbonDioxide: 22,
      calcium: 9.2,
    },
  },
];

let minMaxValues = {
  ventRate: { min: Infinity, max: -Infinity },
  prInterval: { min: Infinity, max: -Infinity },
  qrsInterval: { min: Infinity, max: -Infinity },
  qtcInterval: { min: Infinity, max: -Infinity },
  pAxis: { min: Infinity, max: -Infinity },
  rAxis: { min: Infinity, max: -Infinity },
  tAxis: { min: Infinity, max: -Infinity },
  glucose: { min: Infinity, max: -Infinity },
  nitrogen: { min: Infinity, max: -Infinity },
  creatinine: { min: Infinity, max: -Infinity },
  eGFR: { min: Infinity, max: -Infinity },
  sodium: { min: Infinity, max: -Infinity },
  potassium: { min: Infinity, max: -Infinity },
  chloride: { min: Infinity, max: -Infinity },
  carbonDioxide: { min: Infinity, max: -Infinity },
  calcium: { min: Infinity, max: -Infinity },
};

healthDataSets.forEach((dataSet) => {
  // Update min/max for ECG metrics
  minMaxValues.ventRate.min = Math.min(
    minMaxValues.ventRate.min,
    dataSet.ecg.ventRate
  );
  minMaxValues.ventRate.max = Math.max(
    minMaxValues.ventRate.max,
    dataSet.ecg.ventRate
  );

  minMaxValues.prInterval.min = Math.min(
    minMaxValues.prInterval.min,
    dataSet.ecg.prInterval
  );
  minMaxValues.prInterval.max = Math.max(
    minMaxValues.prInterval.max,
    dataSet.ecg.prInterval
  );

  minMaxValues.qrsInterval.min = Math.min(
    minMaxValues.qrsInterval.min,
    dataSet.ecg.qrsInterval
  );
  minMaxValues.qrsInterval.max = Math.max(
    minMaxValues.qrsInterval.max,
    dataSet.ecg.qrsInterval
  );

  minMaxValues.qtcInterval.min = Math.min(
    minMaxValues.qtcInterval.min,
    dataSet.ecg.qtcInterval
  );
  minMaxValues.qtcInterval.max = Math.max(
    minMaxValues.qtcInterval.max,
    dataSet.ecg.qtcInterval
  );

  minMaxValues.pAxis.min = Math.min(minMaxValues.pAxis.min, dataSet.ecg.pAxis);
  minMaxValues.pAxis.max = Math.max(minMaxValues.pAxis.max, dataSet.ecg.pAxis);

  minMaxValues.rAxis.min = Math.min(minMaxValues.rAxis.min, dataSet.ecg.rAxis);
  minMaxValues.rAxis.max = Math.max(minMaxValues.rAxis.max, dataSet.ecg.rAxis);

  minMaxValues.tAxis.min = Math.min(minMaxValues.tAxis.min, dataSet.ecg.tAxis);
  minMaxValues.tAxis.max = Math.max(minMaxValues.tAxis.max, dataSet.ecg.tAxis);

  // Update min/max for lab values
  minMaxValues.glucose.min = Math.min(
    minMaxValues.glucose.min,
    dataSet.labs.glucose
  );
  minMaxValues.glucose.max = Math.max(
    minMaxValues.glucose.max,
    dataSet.labs.glucose
  );

  minMaxValues.nitrogen.min = Math.min(
    minMaxValues.nitrogen.min,
    dataSet.labs.nitrogen
  );
  minMaxValues.nitrogen.max = Math.max(
    minMaxValues.nitrogen.max,
    dataSet.labs.nitrogen
  );

  minMaxValues.creatinine.min = Math.min(
    minMaxValues.creatinine.min,
    dataSet.labs.creatinine
  );
  minMaxValues.creatinine.max = Math.max(
    minMaxValues.creatinine.max,
    dataSet.labs.creatinine
  );

  minMaxValues.eGFR.min = Math.min(minMaxValues.eGFR.min, dataSet.labs.eGFR);
  minMaxValues.eGFR.max = Math.max(minMaxValues.eGFR.max, dataSet.labs.eGFR);

  minMaxValues.sodium.min = Math.min(
    minMaxValues.sodium.min,
    dataSet.labs.sodium
  );
  minMaxValues.sodium.max = Math.max(
    minMaxValues.sodium.max,
    dataSet.labs.sodium
  );

  minMaxValues.potassium.min = Math.min(
    minMaxValues.potassium.min,
    dataSet.labs.potassium
  );
  minMaxValues.potassium.max = Math.max(
    minMaxValues.potassium.max,
    dataSet.labs.potassium
  );

  minMaxValues.chloride.min = Math.min(
    minMaxValues.chloride.min,
    dataSet.labs.chloride
  );
  minMaxValues.chloride.max = Math.max(
    minMaxValues.chloride.max,
    dataSet.labs.chloride
  );

  minMaxValues.carbonDioxide.min = Math.min(
    minMaxValues.carbonDioxide.min,
    dataSet.labs.carbonDioxide
  );
  minMaxValues.carbonDioxide.max = Math.max(
    minMaxValues.carbonDioxide.max,
    dataSet.labs.carbonDioxide
  );

  minMaxValues.calcium.min = Math.min(
    minMaxValues.calcium.min,
    dataSet.labs.calcium
  );
  minMaxValues.calcium.max = Math.max(
    minMaxValues.calcium.max,
    dataSet.labs.calcium
  );
});

console.log(minMaxValues);
