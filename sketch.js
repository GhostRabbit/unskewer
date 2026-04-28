let img;
let points = [
    {x: 50, y: 50},      // 0: top-left
    {x: 350, y: 50},     // 1: top-right
    {x: 350, y: 290},    // 2: bottom-right
    {x: 50, y: 290}      // 3: bottom-left
];
let dragging = -1;
let outputWidth = 400;
let outputHeight = 300;
let outputCanvas;
let pointsChanged = true;
let imgLoaded = false;
let zoom = 1;
let panX = 0;
let panY = 0;
let previewQuality = 1;
let unskewShader;

const vertSrc = `
attribute vec3 aPosition;
attribute vec2 aTexCoord;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
varying vec2 vTexCoord;
void main() {
  vTexCoord = aTexCoord;
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
}
`;

const fragSrc = `
precision highp float;
varying vec2 vTexCoord;
uniform sampler2D tex;
uniform float H[9];
uniform float texW;
uniform float texH;
uniform float outW;
uniform float outH;
uniform float supersample;

vec4 getColor(float px, float py) {
    float z = H[6] * px + H[7] * py + H[8];
    float srcX = (H[0] * px + H[1] * py + H[2]) / z;
    float srcY = (H[3] * px + H[4] * py + H[5]) / z;
    vec2 uv = vec2(srcX / texW, srcY / texH);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        return vec4(1.0, 1.0, 1.0, 0.0);
    }
    return texture2D(tex, uv);
}

void main() {
  float x = vTexCoord.x * outW;
  float y = vTexCoord.y * outH;

  if (supersample > 0.5) {
      vec4 c1 = getColor(x - 0.25, y - 0.25);
      vec4 c2 = getColor(x + 0.25, y - 0.25);
      vec4 c3 = getColor(x - 0.25, y + 0.25);
      vec4 c4 = getColor(x + 0.25, y + 0.25);
      gl_FragColor = (c1 + c2 + c3 + c4) / 4.0;
  } else {
      gl_FragColor = getColor(x, y);
  }
}
`;

function setup() {
    pixelDensity(1);
    let mainCanvas = createCanvas(400, 300);
    mainCanvas.parent('canvas-input');
    
    outputCanvas = createGraphics(outputWidth, outputHeight, WEBGL);
    outputCanvas.pixelDensity(1);
    outputCanvas.parent('canvas-output');
    
    unskewShader = outputCanvas.createShader(vertSrc, fragSrc);
    
    let fileInput = select('#imageInput');
    fileInput.changed(() => {
        let file = fileInput.elt.files[0];
        if (file) {
            loadImage(URL.createObjectURL(file), (loadedImg) => {
                img = loadedImg;
                pointsChanged = true;
            });
        }
    });
    
    let presetSelect = select('#presetSizes');
    let widthInput = select('#width');
    let heightInput = select('#height');
    let lockRatioCheckbox = select('#lockRatio');
    
    presetSelect.changed(() => {
        let val = presetSelect.value();
        if (val !== 'custom') {
            let parts = val.split('x');
            widthInput.value(parts[0]);
            heightInput.value(parts[1]);
            outputWidth = int(parts[0]);
            outputHeight = int(parts[1]);
            outputCanvas.resizeCanvas(outputWidth, outputHeight);
            pointsChanged = true;
        }
    });

    widthInput.changed(() => {
        let oldW = outputWidth;
        outputWidth = int(widthInput.value());
        if (lockRatioCheckbox.checked()) {
            outputHeight = Math.round(outputHeight * (outputWidth / oldW));
            heightInput.value(outputHeight);
        }
        presetSelect.value('custom');
        outputCanvas.resizeCanvas(outputWidth, outputHeight);
        pointsChanged = true;
    });
    
    heightInput.changed(() => {
        let oldH = outputHeight;
        outputHeight = int(heightInput.value());
        if (lockRatioCheckbox.checked()) {
            outputWidth = Math.round(outputWidth * (outputHeight / oldH));
            widthInput.value(outputWidth);
        }
        presetSelect.value('custom');
        outputCanvas.resizeCanvas(outputWidth, outputHeight);
        pointsChanged = true;
    });
    
    let recalcButton = select('#recalc');
    recalcButton.mousePressed(() => {
        pointsChanged = true;
    });
    
    let qualitySelect = select('#quality');
    qualitySelect.changed(() => {
        previewQuality = parseFloat(qualitySelect.value());
        pointsChanged = true;
    });
    
    let saveButton = select('#downloadImage');
    saveButton.mousePressed(() => {
        if (outputCanvas && img) {
            // Render at full supersampled quality before saving
            applyPerspectiveCorrection(0.5);
            outputCanvas.save('unskewed.png');
            // Re-render at current preview quality after saving
            applyPerspectiveCorrection(previewQuality);
        }
    });
}

function draw() {
    background(240);
    
    if (img) {
        if (!imgLoaded) {
            imgLoaded = true;
            pointsChanged = true;
        }
        // draw input image on first canvas
        push();
        translate(panX, panY);
        scale(zoom);
        image(img, 0, 0, 400, 300);
        
        // draw quadrilateral
        stroke(255, 0, 0);
        strokeWeight(2 / zoom); // adjust for scale
        noFill();
        beginShape();
        for (let p of points) {
            vertex(p.x, p.y);
        }
        endShape(CLOSE);
        
        // draw points
        fill(255, 0, 0);
        noStroke();
        for (let i = 0; i < points.length; i++) {
            let p = points[i];
            ellipse(p.x, p.y, 10, 10);
            
            // Draw labels with coordinates
            fill(255);
            textSize(12);
            text(`(${Math.round(p.x)},${Math.round(p.y)})`, p.x + 15, p.y);
            fill(255, 0, 0);
        }
        
        // Draw image dimensions text
        fill(255, 255, 0);
        textSize(14);
        text(`Canvas: 400x300 | Image: ${img.width}x${img.height}`, 10, 20);
        
        pop();
    }
    
    // draw output
    if (pointsChanged) {
        outputCanvas.background(255);
        if (img) {
            applyPerspectiveCorrection(previewQuality);
        }
        pointsChanged = false;
    }
}

function applyPerspectiveCorrection(qualityOverride) {
    let t0 = performance.now();
    let q = qualityOverride !== undefined ? qualityOverride : previewQuality;
    
    let srcPoints = points.map(p => ({
        x: p.x * (img.width / 400),
        y: p.y * (img.height / 300)
    }));
    
    let dstPoints = [
        {x: 0, y: 0},
        {x: outputWidth, y: 0},
        {x: outputWidth, y: outputHeight},
        {x: 0, y: outputHeight}
    ];
    
    let H = computeHomography(dstPoints, srcPoints);
    
    outputCanvas.shader(unskewShader);
    unskewShader.setUniform('tex', img);
    unskewShader.setUniform('H', [
        H[0][0], H[0][1], H[0][2],
        H[1][0], H[1][1], H[1][2],
        H[2][0], H[2][1], H[2][2]
    ]);
    unskewShader.setUniform('texW', img.width);
    unskewShader.setUniform('texH', img.height);
    unskewShader.setUniform('outW', outputWidth);
    unskewShader.setUniform('outH', outputHeight);
    unskewShader.setUniform('supersample', q === 0.5 ? 1.0 : 0.0);
    
    outputCanvas.noStroke();
    outputCanvas.rectMode(CENTER);
    outputCanvas.rect(0, 0, outputWidth, outputHeight);
    
    let t1 = performance.now();
    let timeSpan = select('#recalcTime');
    if (timeSpan) {
        timeSpan.html((t1 - t0).toFixed(1) + ' ms');
    }
}

function computeHomography(srcPoints, dstPoints) {
    // Normalization to improve numerical stability in DLT
    function getNormMatrix(pts) {
        let cx = 0, cy = 0;
        for (let p of pts) { cx += p.x; cy += p.y; }
        cx /= pts.length;
        cy /= pts.length;
        let meanDist = 0;
        for (let p of pts) {
            meanDist += Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
        }
        meanDist /= pts.length;
        let scale = meanDist === 0 ? 1 : Math.sqrt(2) / meanDist;
        return [
            [scale, 0, -scale * cx],
            [0, scale, -scale * cy],
            [0, 0, 1]
        ];
    }

    let T1 = getNormMatrix(srcPoints);
    let T2 = getNormMatrix(dstPoints);

    function applyTransform(T, p) {
        let x = T[0][0] * p.x + T[0][1] * p.y + T[0][2];
        let y = T[1][0] * p.x + T[1][1] * p.y + T[1][2];
        let z = T[2][0] * p.x + T[2][1] * p.y + T[2][2];
        return { x: x / z, y: y / z };
    }

    let normSrc = srcPoints.map(p => applyTransform(T1, p));
    let normDst = dstPoints.map(p => applyTransform(T2, p));

    let A = [];
    let b = [];
    for (let i = 0; i < 4; i++) {
        let xi = normSrc[i].x;
        let yi = normSrc[i].y;
        let ui = normDst[i].x;
        let vi = normDst[i].y;
        
        A.push([xi, yi, 1, 0, 0, 0, -ui * xi, -ui * yi]);
        b.push(ui);
        A.push([0, 0, 0, xi, yi, 1, -vi * xi, -vi * yi]);
        b.push(vi);
    }
    
    let vec = solveLinearSystem(A, b);
    vec.push(1); // h33
    
    let H_norm = [
        [vec[0], vec[1], vec[2]],
        [vec[3], vec[4], vec[5]],
        [vec[6], vec[7], 1]
    ];
    
    let T2_inv = matrixInverse3x3(T2);
    
    function mult(M1, M2) {
        let res = [[0,0,0],[0,0,0],[0,0,0]];
        for(let r=0; r<3; r++) {
            for(let c=0; c<3; c++) {
                for(let k=0; k<3; k++) {
                    res[r][c] += M1[r][k] * M2[k][c];
                }
            }
        }
        return res;
    }
    
    let H = mult(T2_inv, mult(H_norm, T1));
    
    if (Math.abs(H[2][2]) > 1e-10) {
        let inv = 1 / H[2][2];
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                H[r][c] *= inv;
            }
        }
    }
    
    return H;
}

function solveLinearSystem(A, b) {
    // Simple Gaussian elimination for 8x8
    let n = A.length;
    let augmented = A.map((row, i) => [...row, b[i]]);
    
    for (let i = 0; i < n; i++) {
        // Find pivot
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
                maxRow = k;
            }
        }
        // Swap
        [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
        
        // Eliminate
        for (let k = i + 1; k < n; k++) {
            let c = -augmented[k][i] / augmented[i][i];
            for (let j = i; j < n + 1; j++) {
                if (i === j) {
                    augmented[k][j] = 0;
                } else {
                    augmented[k][j] += c * augmented[i][j];
                }
            }
        }
    }
    
    // Back substitution
    let x = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
        x[i] = augmented[i][n] / augmented[i][i];
        for (let k = i - 1; k >= 0; k--) {
            augmented[k][n] -= augmented[k][i] * x[i];
        }
    }
    return x;
}

function matrixInverse3x3(M) {
    let det = M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
              M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
              M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    
    if (Math.abs(det) < 1e-6) return null;
    
    let invDet = 1 / det;
    return [
        [
            (M[1][1] * M[2][2] - M[1][2] * M[2][1]) * invDet,
            (M[0][2] * M[2][1] - M[0][1] * M[2][2]) * invDet,
            (M[0][1] * M[1][2] - M[0][2] * M[1][1]) * invDet
        ],
        [
            (M[1][2] * M[2][0] - M[1][0] * M[2][2]) * invDet,
            (M[0][0] * M[2][2] - M[0][2] * M[2][0]) * invDet,
            (M[0][2] * M[1][0] - M[0][0] * M[1][2]) * invDet
        ],
        [
            (M[1][0] * M[2][1] - M[1][1] * M[2][0]) * invDet,
            (M[0][1] * M[2][0] - M[0][0] * M[2][1]) * invDet,
            (M[0][0] * M[1][1] - M[0][1] * M[1][0]) * invDet
        ]
    ];
}

// GPU Shader handles applyHomography and getBilinearColor now

function mousePressed() {
    if (img && mouseX < 400) {
        let relX = (mouseX - panX) / zoom;
        let relY = (mouseY - panY) / zoom;
        if (relX >= 0 && relX <= 400 && relY >= 0 && relY <= 300) {
            for (let i = 0; i < points.length; i++) {
                if (dist(relX, relY, points[i].x, points[i].y) < 15) {
                    dragging = i;
                    break;
                }
            }
        }
    }
}

function mouseDragged() {
    if (dragging >= 0) {
        let relX = (mouseX - panX) / zoom;
        let relY = (mouseY - panY) / zoom;
        
        let minDist = 20;
        if (dragging === 0) { // top-left
            relX = constrain(relX, 0, points[1].x - minDist);
            relY = constrain(relY, 0, points[3].y - minDist);
        } else if (dragging === 1) { // top-right
            relX = constrain(relX, points[0].x + minDist, 400);
            relY = constrain(relY, 0, points[2].y - minDist);
        } else if (dragging === 2) { // bottom-right
            relX = constrain(relX, points[3].x + minDist, 400);
            relY = constrain(relY, points[1].y + minDist, 300);
        } else if (dragging === 3) { // bottom-left
            relX = constrain(relX, 0, points[2].x - minDist);
            relY = constrain(relY, points[0].y + minDist, 300);
        }
        
        points[dragging].x = relX;
        points[dragging].y = relY;
    }
}

function mouseReleased() {
    dragging = -1;
}