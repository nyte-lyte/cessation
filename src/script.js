const canvas = document.getElementById("canvas1");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

ctx.strokeStyle = "white";
ctx.fillStyle = "white";
ctx.lineWidth = 1;

// Flow Field Settings
const cols = 30; // Number of columns
const rows = 30; // Number of rows

// Particle System
let particles = [];

// Flow Field Class
class FlowField {
  constructor(cols, rows, width, height) {
    this.cols = cols;
    this.rows = rows;
    this.cellWidth = width / cols;
    this.cellHeight = height / rows;
    this.field = [];

    for (let y = 0; y < rows; y++) {
      this.field[y] = [];
      for (let x = 0; x < cols; x++) {
        this.field[y][x] = {
          angle: Math.random() * Math.PI * 2,
          magnitude: Math.random() * 2,
        };
      }
    }
  }

  updateWithHealthData(dataSet) {
    // Example: Map health data to flow field vectors
    const angleInfluence =
      normalize(
        dataSet.ecg.tAxis,
        minMaxValues.tAxis.min,
        minMaxValues.tAxis.max
      ) *
      Math.PI *
      2;
    const magnitudeInfluence = normalize(
      dataSet.ecg.ventRate,
      minMaxValues.ventRate.min,
      minMaxValues.ventRate.max
    );

    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        this.field[y][x].angle = angleInfluence;
        this.field[y][x].magnitude = magnitudeInfluence;
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

// Particle Class
class Particle {
  constructor(flowField) {
    this.flowField = flowField;
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.speed = Math.random() * 2 + 1;
    this.direction = 0;
  }

  update() {
    const col = Math.floor(this.x / this.flowField.cellWidth);
    const row = Math.floor(this.y / this.flowField.cellHeight);

    console.log(
      `Col: ${col}, Row: ${row}, FlowField Cols: ${this.flowField.cols}, Rows: ${this.flowField.rows}`
    );

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
      } else {
        console.error("Vector is undefined at this position:", col, row);
      }
    } else {
      console.warn("Particle is out of bounds:", this.x, this.y);
      this.x = Math.random() * this.flowField.width;
      this.y = Math.random() * this.flowField.height;
    }
    // Keep particles within bounds
    if (this.x < 0) this.x = canvas.width;
    if (this.x > canvas.width) this.x = 0;
    if (this.y < 0) this.y = canvas.height;
    if (this.y > canvas.height) this.y = 0;
  }

  draw(context) {
    context.fillRect(this.x, this.y, 2, 2);
  }
}

// Initialization
const flowField = new FlowField(cols, rows, canvas.width, canvas.height);
const numberOfParticles = 100;
for (let i = 0; i < numberOfParticles; i++) {
  particles.push(new Particle(flowField));
}

// Example: Apply health data to update the flow field
// flowField.updateWithHealthData(healthDataSets[0]);

function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  flowField.draw(ctx);
  particles.forEach((particle) => {
    particle.update();
    particle.draw(ctx);
  });

  requestAnimationFrame(animate);
}
// Start the animation
animate();
