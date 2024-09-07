const canvas = document.getElementById("canvas1");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

ctx.strokeStyle = "white";
ctx.fillStyle = "white";
ctx.lineWidth = 1;

let currentHealthIndex;
let currentDataSetIndex = 0;
let flowField;
let particles = [];
let resolution = 50;

// Flow Field Settings
class FlowField {
  constructor(resolution, width, height, healthIndex) {
    this.resolution = resolution;
    this.cols = Math.floor(width / resolution);
    this.rows = Math.floor(height / resolution);
    this.cellWidth = width / this.cols;
    this.cellHeight = height / this.rows;
    this.field = [];

    for (let y = 0; y < this.rows; y++) {
      this.field[y] = [];
      for (let x = 0; x < this.cols; x++) {
        const angleInfluence = healthIndex * Math.PI * 2;
        const magnitudeInfluence = healthIndex * 2;
        this.field[y][x] = {
          angle: Math.random() * 0.2,
          magnitude: Math.random() * 0.1,
        };
      }
    }
  }

  draw(context) {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const vector = this.field[y][x];
        const posX = x * this.cellWidth;
        const posY = y * this.cellHeight;

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
  constructor(flowField, x, y, healthIndex) {
    this.flowField = flowField;
    this.x = x || Math.random() * canvas.width;
    this.y = y || Math.random() * canvas.height;
    this.speed = (Math.random() * 2 + 1) * healthIndex;
    this.direction = Math.random() * Math.PI * 2; // Random direction
    this.initialX = this.x; // Store initial position
    this.initialY = this.y;
  }

  calculateSize(healthIndex) {
    return 2 + healthIndex * 5;
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
        this.direction = vector.angle;
        this.x += Math.cos(this.direction) * this.speed;
        this.y += Math.sin(this.direction) * this.speed;
      }
    }

    // Keep particles within bounds
    if (this.x < 0) this.x = canvas.width - 1;
    if (this.x >= canvas.width) this.x = 0;
    if (this.y < 0) this.y = canvas.height - 1;
    if (this.y >= canvas.height) this.y = 0;
  }

  draw(context) {
    context.beginPath();
    context.arc(
      this.x,
      this.y,
      this.calculateSize(currentHealthIndex),
      0,
      Math.PI * 2
    );
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
    currentHealthIndex
  );

  particles = [];
  let numberOfParticles = 500;

  for (let i = 0; i < numberOfParticles; i++) {
    const startX = Math.random() * canvas.width;
    const startY = Math.random() * canvas.height;
    particles.push(new Particle(flowField, startX, startY, currentHealthIndex));
  }

  animate();
}

function animate() {
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "white";
  ctx.fillStyle = "white";

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

initializePiece(healthDataSets[19]); // Initialize with the first dataset
