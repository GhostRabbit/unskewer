let outputWidth = 400;
let outputHeight = 300;
let outputCanvas;
let unskewShader;

function setup() {
    createCanvas(400, 300);
    
    outputCanvas = createGraphics(outputWidth, outputHeight, WEBGL);
    
    let vertSrc = `
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

    let fragSrc = `
    precision highp float;
    varying vec2 vTexCoord;
    void main() {
      gl_FragColor = vec4(vTexCoord.x, vTexCoord.y, 0.0, 1.0);
    }
    `;
    
    unskewShader = outputCanvas.createShader(vertSrc, fragSrc);
    
    outputCanvas.shader(unskewShader);
    outputCanvas.noStroke();
    outputCanvas.rect(-outputWidth/2, -outputHeight/2, outputWidth, outputHeight);
    
    image(outputCanvas, 0, 0);
}
