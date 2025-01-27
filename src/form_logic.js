let timeOffset = 0; // For Perlin noise dynamics

// Draw an organic blob
function drawOrganicBlob(cell) {
  let detail = 20; 
  let baseSize = resolution * 1.7;
  let radius = baseSize * cell.health;
  let noiseScale = map(cell.health, 0, 1, 10, 50); // Higher distortion as health decays

  beginShape();
  for (let i = 0; i < TWO_PI; i += TWO_PI / detail) {
    // Base radius with Perlin noise for distortion
    let offset = map(
      noise(cell.x * 0.01 + cos(i) * noiseScale, cell.y * 0.01 + sin(i) * noiseScale),
      0,
      1,
      -radius * 0.3,
      radius * 0.3
    );
    let x = cell.x + (radius + offset) * cos(i);
    let y = cell.y + (radius + offset) * sin(i);
    vertex(x, y);
  }
  endShape(CLOSE);
}


// Update Perlin noise offset for animation
function updateBlobTime() {
  timeOffset += 0.01; // Adjust for smooth animation
}
