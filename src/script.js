const canvas = document.getElementById("canvas1");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let currentHealthIndex;
let currentDataSetIndex = 0;
let flowField;
let particles = [];
let resolution = 50;

// HSB to RGB conversion function
function hsbToRgb(hue, saturation, brightness) {
  const h = hue / 360;
  const s = saturation / 100;
  const v = brightness / 100;
  let r = 0,
    g = 0,
    b = 0;

  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0:
      (r = v), (g = t), (b = p);
      break;
    case 1:
      (r = q), (g = v), (b = p);
      break;
    case 2:
      (r = p), (g = v), (b = t);
      break;
    case 3:
      (r = p), (g = q), (b = v);
      break;
    case 4:
      (r = t), (g = p), (b = v);
      break;
    case 5:
      (r = v), (g = p), (b = q);
      break;
  }

  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(
    b * 255
  )})`;
}

// Flow Field Settings
class FlowField {
  constructor(resolution, width, height, healthIndex, metricType, metricValue) {
    this.resolution = resolution;
    this.cols = Math.floor(width / resolution);
    this.rows = Math.floor(height / resolution);
    this.cellWidth = width / this.cols;
    this.cellHeight = height / this.rows;
    this.field = [];

    for (let y = 0; y < this.rows; y++) {
      this.field[y] = [];
      for (let x = 0; x < this.cols; x++) {
        const angle = healthIndex * Math.PI * 2 * Math.random() + Math.random();
        const magnitude = (Math.random() * 0.8 + 0.2) * healthIndex; // Variable magnitude
        this.field[y][x] = {
          angle: angle,
          magnitude: magnitude,
        };
      }
    }
  }

  calculateAngle(metricType, metricValue, x, y) {
    // Use different health metrics to affect the angle of movement
    if (metricType === "ventRate") {
      return (metricValue / 100) * Math.PI * 2 + Math.random() * Math.PI * 2;
    } else if (metricType === "tAxis") {
      return (metricValue / 360) * Math.PI * 2 + (y / this.rows) * Math.PI * 2;
    }
    return Math.random() * Math.PI * 2; // Ensure randomness in the angle
  }

  calculateMagnitude(healthIndex, metricType, metricValue) {
    return (Math.random() * 0.5 + 0.5) * (healthIndex + 0.1); // Randomize magnitude but tie to healthIndex
  }

  draw(context) {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const vector = this.field[y][x];
        const posX = x * this.cellWidth;
        const posY = y * this.cellHeight;
        context.strokeStyle = `rgba(255, 255, 255, ${vector.magnitude * 0.5})`;
        context.beginPath();
        context.moveTo(posX, posY);
        context.lineTo(
          posX + Math.cos(vector.angle) * vector.magnitude * 20,
          posY + Math.sin(vector.angle) * vector.magnitude * 20
        );
        context.stroke();
      }
    }
  }
}

class Particle {
  constructor(flowField, x, y, healthIndex, metricType, metricValue) {
    this.flowField = flowField;
    this.x = x || Math.random() * canvas.width;
    this.y = y || Math.random() * canvas.height;

    // Each metric type (e.g., ventRate, glucose) influences the particle's speed, direction, or size
    this.metricType = metricType;
    this.metricValue = metricValue;
    this.speed = this.calculateSpeed(healthIndex, metricType, metricValue);
    this.direction = Math.random() * Math.PI * 2; // Random direction
    this.size = this.calculateSize(healthIndex, metricType, metricValue);
    this.color = this.calculateColor(healthIndex, metricType, metricValue);
    this.initialX = this.x; // Store initial position
    this.initialY = this.y;
  }

  calculateSpeed(healthIndex, metricType, metricValue) {
    // Different metrics influence speed differently
    if (metricType === "ventRate") {
      return (Math.random() * 2 + 1) * (metricValue / 100);
    } else if (metricType === "glucose") {
      return (Math.random() * 1.5 + 0.5) * (metricValue / 200);
    }
    // Default speed
    return (Math.random() * 2 + 1) * healthIndex;
  }

  calculateSize(healthIndex, metricType, metricValue) {
    // Different metrics influence size differently
    if (metricType === "qrsInterval") {
      return 2 + (metricValue / 100) * 10;
    } else if (metricType === "calcium") {
      return 2 + (metricValue / 10) * 5;
    }
    // Default size
    return 2 + healthIndex * 10;
  }

  calculateColor(healthIndex, metricType, metricValue) {
    // Different metrics influence color
    if (metricType === "tAxis") {
      const hue = Math.floor((metricValue / 100) * 360); // Color based on the metric value
      const saturation = 70 + Math.floor(healthIndex * 30);
      const brightness = 50 + Math.floor(healthIndex * 50);
      return hsbToRgb(hue, saturation, brightness);
    } else if (metricType === "sodium") {
      return `rgba(255, ${Math.floor(metricValue)}, ${Math.floor(
        255 * (1 - healthIndex)
      )}, 0.8)`;
    }
    // Default color
    return hsbToRgb(Math.floor(healthIndex * 360), 100, 100);
  }
  update() {
    const col = Math.floor(this.x / this.flowField.cellWidth);
    const row = Math.floor(this.y / this.flowField.cellHeight);

    if (
      col >= 0 &&
      col < this.flowField.cols &&
      row >= 0 &&
      row < this.flowField.rows
    ) {
      const vector = this.flowField.field[row][col];
      if (vector) {
        this.direction = vector.angle * (Math.random() * 1.225 - 1.0);
        this.x += Math.cos(this.direction) * (this.speed + vector.magnitude);
        this.y += Math.sin(this.direction) * (this.speed + vector.magnitude);
      }
    }

    // Keep particles within bounds
    if (this.x < 0) this.x = canvas.width - 1;
    if (this.x >= canvas.width) this.x = 0;
    if (this.y < 0) this.y = canvas.height - 1;
    if (this.y >= canvas.height) this.y = 0;
  }

  draw(context) {
    context.fillStyle = this.color;
    context.beginPath();
    context.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    context.fill();
  }

  resetPosition() {
    this.x = (this.initialX / canvas.width) * this.flowField.width;
    this.y = (this.initialY / canvas.height) * this.flowField.height;

    // Ensure particle positions are within bounds
    if (this.x < 0 || this.x >= canvas.width)
      this.x = Math.random() * canvas.width;
    if (this.y < 0 || this.y >= canvas.height)
      this.y = Math.random() * canvas.height;
  }
}

function initializePiece(dataSet) {
  currentHealthIndex = calculateHealthIndex(dataSet);

  flowField = new FlowField(
    resolution,
    canvas.width,
    canvas.height,
    currentHealthIndex,
    "glucose",
    dataSet.ecg.glucose
  );

  particles = [];
  let numberOfParticles = 5500;

  for (let i = 0; i < numberOfParticles; i++) {
    const startX = Math.random() * canvas.width;
    const startY = Math.random() * canvas.height;

    let metricType, metricValue;
    // Group particles by specific health metrics
    if (i % 3 === 0) {
      metricType = "ventRate";
      metricValue = dataSet.ecg.ventRate;
    } else if (i % 3 === 1) {
      metricType = "glucose";
      metricValue = dataSet.labs.glucose;
    } else {
      metricType = "tAxis";
      metricValue = dataSet.ecg.tAxis;
    }

    particles.push(
      new Particle(
        flowField,
        startX,
        startY,
        currentHealthIndex,
        metricType,
        metricValue
      )
    );
  }

  animate();
}

function animate() {
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  flowField.draw(ctx);

  particles.forEach((particle) => {
    particle.update();
    particle.draw(ctx);
  });

  requestAnimationFrame(animate);
}

window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  flowField = new FlowField(
    resolution,
    canvas.width,
    canvas.height,
    currentHealthIndex
  );

  particles.forEach((particle) => {
    particle.resetPosition();

    if (isNaN(particle.x) || particle.x < 0 || particle.x >= canvas.width) {
      particle.x = Math.random() * canvas.width;
    }
    if (isNaN(particle.y) || particle.y < 0 || particle.y >= canvas.height) {
      particle.y = Math.random() * canvas.height;
    }
  });

  console.log("Particles repositioned.");
});

initializePiece(healthDataSets[15]); // Initialize with the first dataset
