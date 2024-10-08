// Copyright 2014 Todd Fleming
// Copyright 2024 Tomas Mudrunka
//
// This file was originaly part of jscut.
//
// jscut is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// jscut is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with jscut.  If not, see <http://www.gnu.org/licenses/>.

//for i in *.txt; do echo "var ${i%%.txt}Src = \`"; cat "$i"; echo '`;'; done > shaders.js


/// BASIC SHADER PROGRAM - Renders arbitrary shapes as cutter and origin cross
var basicFragmentShaderSrc = `
precision mediump float;

varying vec4 color;

void main(void) {
    gl_FragColor = color;
}
`;
var basicVertexShaderSrc = `
uniform vec2 aspect;
uniform vec3 scale;
uniform vec3 translate;
uniform mat4 rotate;

attribute vec3 vPos;
attribute vec3 vColor;

varying vec4 color;

void main(void) {
    mat4 translateScale = mat4(
        scale.x,        0.0,            0.0,                0.0,
        0.0,            scale.y,        0.0,                0.0,
        0.0,            0.0,            scale.z,            0.0,
        translate.x,    translate.y,    translate.z,        1.0
    );

    float left = -.6;
    float right = .6;
    float top = .6;
    float bot = -.6;
    float near = 2.0;
    float far = 5.0;
    mat4 camera = mat4(
        2.0*near/(right-left),      0.0,                    0.0,                        0.0,
        0.0,                        2.0*near/(top-bot),     0.0,                        0.0,
        (right+left)/(right-left),  (top+bot)/(top-bot),    (far+near)/(near-far),      -1,
        0.0,                        0.0,                    2.0*far*near/(near-far),    0.0
    );

    gl_Position = camera * (rotate * translateScale * vec4(vPos, 1.0) + vec4(0.0, 0.0, -3.5, 0.0)) * vec4(aspect.x, aspect.y, 1.0, 1.0);
    color = vec4(vColor, 1.0);
    gl_PointSize = 5.0;
}
`;

// RASTERIZE PATH SHADER PROGRAM - creates 2D heightmap from path and cutter shape
var rasterizePathFragmentShaderSrc = `
precision mediump float;

varying vec4 color;
varying vec2 center;
varying float radius;
varying float enable;

void main(void) {
    gl_FragColor = color;
    if(enable == 0.0 || radius > 0.0 && distance(gl_FragCoord.xy, center) > radius)
        discard;
}
`;
var rasterizePathVertexShaderSrc = `
uniform float resolution;
uniform float cutterDia;
uniform vec2 pathXYOffset;
uniform float pathScale;
uniform float pathMinZ;
uniform float pathTopZ;
uniform float stopAtTime;

attribute vec3 pos1;
attribute vec3 pos2;
attribute vec3 rawPos;
attribute float startTime;
attribute float endTime;
attribute float command;

varying vec4 color;
varying vec2 center;
varying float radius;
varying float enable;

void main(void) {
    enable = 1.0;

    vec3 clampedPos2;

    clampedPos2 = pos2;
    if(stopAtTime < startTime)
        enable = 0.0;
    else if(stopAtTime < endTime)
        clampedPos2 = pos1 + (pos2-pos1)*(stopAtTime-startTime)/(endTime-startTime);

    vec3 lower, upper;
    if(pos1.z < pos2.z) {
        lower = vec3((pos1.xy+pathXYOffset)*pathScale, pos1.z);
        upper = vec3((clampedPos2.xy+pathXYOffset)*pathScale, clampedPos2.z);
    } else {
        lower = vec3((clampedPos2.xy+pathXYOffset)*pathScale, clampedPos2.z);
        upper = vec3((pos1.xy+pathXYOffset)*pathScale, pos1.z);
    }

    // command 00-02: lower circle triangle 1
    // command 03-05: lower circle triangle 2
    // command 06-08: upper circle triangle 1
    // command 09-11: upper circle triangle 2
    // command 12-14: connecting line triangle 1
    // command 15-17: connecting line triangle 2
    // command 100: pos1 + rawPos
    // command 101: clampedPos2 + rawPos
    // command 200: discard

    int i = int(command);
    vec3 thisPos;
    if(i < 6)
        thisPos = lower;
    else
        thisPos = upper;

    center = (thisPos.xy*resolution + resolution)/2.0;
    color = vec4(0.0, 1.0, 1.0, 1.0);
    float r = cutterDia*pathScale/2.0;

    if(i < 12) {
        radius = r*resolution/2.0;
        vec2 offset;
        if(i == 0 || i == 6)
            offset = vec2(-r, -r);
        else if(i == 1 || i == 7)
            offset = vec2(r, r);
        else if(i == 2 || i == 8)
            offset = vec2(-r, r);
        else if(i == 3 || i == 9)
            offset = vec2(-r, -r);
        else if(i == 4 || i == 10)
            offset = vec2(r, -r);
        else if(i == 5 || i == 11)
            offset = vec2(r, r);
        gl_Position = vec4(thisPos.xy + offset, thisPos.z, 1.0);
    } else {
        radius = 0.0;
        vec2 delta = normalize(lower.xy - upper.xy) * r;
        float l = length(delta);
        if(i == 12)
            gl_Position = vec4(upper.x+delta.y, upper.y-delta.x, upper.z, 1.0);
        else if(i == 13)
            gl_Position = vec4(lower.x+delta.y, lower.y-delta.x, lower.z, 1.0);
        else if(i == 14)
            gl_Position = vec4(upper.x-delta.y, upper.y+delta.x, upper.z, 1.0);
        else if(i == 15)
            gl_Position = vec4(upper.x-delta.y, upper.y+delta.x, upper.z, 1.0);
        else if(i == 16)
            gl_Position = vec4(lower.x+delta.y, lower.y-delta.x, lower.z, 1.0);
        else if(i == 17)
            gl_Position = vec4(lower.x-delta.y, lower.y+delta.x, lower.z, 1.0);
        else if(i == 100)
            gl_Position = vec4((pos1.xy+rawPos.xy+pathXYOffset)*pathScale, pos1.z+rawPos.z, 1.0);
        else if(i == 101)
            gl_Position = vec4((clampedPos2.xy+rawPos.xy+pathXYOffset)*pathScale, clampedPos2.z+rawPos.z, 1.0);
        else if(i == 200) {
            gl_Position = vec4(0, 0, 0, 1.0);
            enable = 0.0;
        }
    }

    float bottom = pathMinZ;
    if(bottom == pathTopZ)
        bottom = pathTopZ - 1.0;

    // color.r = normalized cut depth
    color.r = (gl_Position.z - pathTopZ) / (bottom - pathTopZ);

    gl_Position.z = 1.9999 * (gl_Position.z - bottom) / (pathTopZ - bottom) - 1.0;
}
`;

// RENDER HEIGHT MAP SHADER PROGRAM - renders 2D heightmap in 3D (visualy represents material after milling operation)
var renderHeightMapFragmentShaderSrc = `
precision mediump float;

varying vec4 color;

void main(void) {
    gl_FragColor = color;
}
`;
var renderHeightMapVertexShaderSrc = `
uniform vec2 aspect;
uniform float resolution;
uniform float pathScale;
uniform float pathMinZ;
uniform float pathTopZ;
uniform mat4 rotate;
uniform sampler2D heightMap;

attribute vec2 pos0;
attribute vec2 pos1;
attribute vec2 pos2;
attribute vec2 thisPos;
attribute float vertex;

varying vec4 color;

vec3 getPos(in vec2 p) {
    return vec3(
        p * 2.0 / resolution - vec2(1.0, 1.0),
        texture2D(heightMap, p/resolution).r);
}

void main(void) {
    vec3 p0 = getPos(pos0);
    vec3 p1 = getPos(pos1);
    vec3 p2 = getPos(pos2);
    vec3 tp = getPos(thisPos);

    //COLOR OF STOCK MATERIAL
    vec4 topColor = vec4(0.9, 0.9, 1.0, 1.0);
    vec4 botColor = vec4(0.0, 0.0, 0.4, 1.0);
    vec4 transitionColor = vec4(0.0, 0.0, 0.6, 1.0);

    float transition = min(.4, 100.0*max(abs(p0.z-p1.z), abs(p0.z-p2.z)));
    color = mix(topColor, botColor, tp.z);
    color = mix(color, transitionColor, transition);

    // try to make it look like it does to people with red-green color blindness
    // for usability testing.
    //color.rg = vec2((color.r+color.g)/2.0, (color.r+color.g)/2.0);

    vec4 p = vec4(tp.xy, -tp.z*(pathTopZ-pathMinZ)*pathScale, 1.0);

    mat4 offset = mat4(
        1.0,    0.0,    0.0,    0.0,
        0.0,    1.0,    0.0,    0.0,
        0.0,    0.0,    1.0,    0.0,
        0.0,    0.0,    -3.5,   1.0
    );

    float left = -.6;
    float right = .6;
    float top = .6;
    float bot = -.6;
    float near = 2.0;
    float far = 5.0;
    mat4 camera = mat4(
        2.0*near/(right-left),      0.0,                    0.0,                        0.0,
        0.0,                        2.0*near/(top-bot),     0.0,                        0.0,
        (right+left)/(right-left),  (top+bot)/(top-bot),    (far+near)/(near-far),      -1,
        0.0,                        0.0,                    2.0*far*near/(near-far),    0.0
    );

    gl_Position = camera * offset * rotate * p * vec4(aspect.x, aspect.y, 1.0, 1.0);
}
`;


function RenderPath(options, canvas, shaderDir, shadersReady) {
    "use strict";
    var self = this;

    var needToCreatePathTexture = false;
    var needToDrawHeightMap = false;
    var requestFrame;

    var gpuMem = 2 * 1024 * 1024; //This limits total length of toolpath (as represented in gpu buffer)
    var resolution = 1024; //This sets resolution of heightmap (eg. level of detail in XY plane)
    var cutterDia = .125;
    var cutterAngleRad = Math.PI;
    var isVBit = false;
    var cutterH = 0;
    var pathXOffset = 0;
    var pathYOffset = 0;
    var pathScale = 1;
    var pathMinZ = -1;
    var pathTopZ = 0;
    var stopAtTime = 9999999;
    var rotate = mat4.create();
    var canvasAspectX = 1;
    var canvasAspectY = 1;
    self.zoom = 1;

    self.gl = WebGLUtils.setupWebGL(canvas);

    function loadShader(source, type, callback) {
        if (self.gl)
            {
                var shader = self.gl.createShader(type);
                self.gl.shaderSource(shader, source);
                self.gl.compileShader(shader);
                if (self.gl.getShaderParameter(shader, self.gl.COMPILE_STATUS))
                    callback(shader);
                else
                    alert(self.gl.getShaderInfoLog(shader));
            }
    }

    var rasterizePathVertexShader;
    var rasterizePathFragmentShader;
    var rasterizePathProgram;

    function linkRasterizePathProgram() {
        rasterizePathProgram = self.gl.createProgram();
        self.gl.attachShader(rasterizePathProgram, rasterizePathVertexShader);
        self.gl.attachShader(rasterizePathProgram, rasterizePathFragmentShader);
        self.gl.linkProgram(rasterizePathProgram);

        if (!self.gl.getProgramParameter(rasterizePathProgram, self.gl.LINK_STATUS)) {
            alert("Could not initialise RasterizePath shaders");
        }

        self.gl.useProgram(rasterizePathProgram);

        rasterizePathProgram.resolution = self.gl.getUniformLocation(rasterizePathProgram, "resolution");
        rasterizePathProgram.cutterDia = self.gl.getUniformLocation(rasterizePathProgram, "cutterDia");
        rasterizePathProgram.pathXYOffset = self.gl.getUniformLocation(rasterizePathProgram, "pathXYOffset");
        rasterizePathProgram.pathScale = self.gl.getUniformLocation(rasterizePathProgram, "pathScale");
        rasterizePathProgram.pathMinZ = self.gl.getUniformLocation(rasterizePathProgram, "pathMinZ");
        rasterizePathProgram.pathTopZ = self.gl.getUniformLocation(rasterizePathProgram, "pathTopZ");
        rasterizePathProgram.stopAtTime = self.gl.getUniformLocation(rasterizePathProgram, "stopAtTime");
        rasterizePathProgram.pos1 = self.gl.getAttribLocation(rasterizePathProgram, "pos1");
        rasterizePathProgram.pos2 = self.gl.getAttribLocation(rasterizePathProgram, "pos2");
        rasterizePathProgram.rawPos = self.gl.getAttribLocation(rasterizePathProgram, "rawPos");
        rasterizePathProgram.startTime = self.gl.getAttribLocation(rasterizePathProgram, "startTime");
        rasterizePathProgram.endTime = self.gl.getAttribLocation(rasterizePathProgram, "endTime");
        rasterizePathProgram.command = self.gl.getAttribLocation(rasterizePathProgram, "command");

        self.gl.useProgram(null);
    }

    var renderHeightMapVertexShader;
    var renderHeightMapFragmentShader;
    var renderHeightMapProgram;

    function linkRenderHeightMapProgram() {
        renderHeightMapProgram = self.gl.createProgram();
        self.gl.attachShader(renderHeightMapProgram, renderHeightMapVertexShader);
        self.gl.attachShader(renderHeightMapProgram, renderHeightMapFragmentShader);
        self.gl.linkProgram(renderHeightMapProgram);

        if (!self.gl.getProgramParameter(renderHeightMapProgram, self.gl.LINK_STATUS)) {
            alert("Could not initialise RenderHeightMap shaders");
        }

        self.gl.useProgram(renderHeightMapProgram);

        renderHeightMapProgram.aspect = self.gl.getUniformLocation(renderHeightMapProgram, "aspect");
        renderHeightMapProgram.resolution = self.gl.getUniformLocation(renderHeightMapProgram, "resolution");
        renderHeightMapProgram.pathScale = self.gl.getUniformLocation(renderHeightMapProgram, "pathScale");
        renderHeightMapProgram.pathMinZ = self.gl.getUniformLocation(renderHeightMapProgram, "pathMinZ");
        renderHeightMapProgram.pathTopZ = self.gl.getUniformLocation(renderHeightMapProgram, "pathTopZ");
        renderHeightMapProgram.rotate = self.gl.getUniformLocation(renderHeightMapProgram, "rotate");
        renderHeightMapProgram.heightMap = self.gl.getUniformLocation(renderHeightMapProgram, "heightMap");
        renderHeightMapProgram.pos0 = self.gl.getAttribLocation(renderHeightMapProgram, "pos0");
        renderHeightMapProgram.pos1 = self.gl.getAttribLocation(renderHeightMapProgram, "pos1");
        renderHeightMapProgram.pos2 = self.gl.getAttribLocation(renderHeightMapProgram, "pos2");
        renderHeightMapProgram.thisPos = self.gl.getAttribLocation(renderHeightMapProgram, "thisPos");
        //renderHeightMapProgram.command = self.gl.getAttribLocation(renderHeightMapProgram, "command");

        self.gl.useProgram(null);
    }

    var basicVertexShader;
    var basicFragmentShader;
    var basicProgram;

    function linkBasicProgram() {
        basicProgram = self.gl.createProgram();
        self.gl.attachShader(basicProgram, basicVertexShader);
        self.gl.attachShader(basicProgram, basicFragmentShader);
        self.gl.linkProgram(basicProgram);

        if (!self.gl.getProgramParameter(basicProgram, self.gl.LINK_STATUS)) {
            alert("Could not initialise RenderHeightMap shaders");
        }

        self.gl.useProgram(basicProgram);

        basicProgram.aspect = self.gl.getUniformLocation(basicProgram, "aspect");
        basicProgram.scale = self.gl.getUniformLocation(basicProgram, "scale");
        basicProgram.translate = self.gl.getUniformLocation(basicProgram, "translate");
        basicProgram.rotate = self.gl.getUniformLocation(basicProgram, "rotate");
        basicProgram.vPos = self.gl.getAttribLocation(basicProgram, "vPos");
        basicProgram.vColor = self.gl.getAttribLocation(basicProgram, "vColor");

        self.gl.useProgram(null);
    }

    function loadedShader() {
        if (!rasterizePathVertexShader || !rasterizePathFragmentShader || !renderHeightMapVertexShader || !renderHeightMapFragmentShader ||
            !basicVertexShader || !basicFragmentShader)
            return;
        linkRasterizePathProgram();
        linkRenderHeightMapProgram();
        linkBasicProgram();
        shadersReady(self);
    }

    var pathBufferContent;
    var pathNumPoints = 0;
    var pathStride = 9;
    var pathVertexesPerLine = 18;
    var pathNumVertexes = 0;

    //These variables are meant to be read by outside world:
    self.totalTime = 0;
    self.X = 0;
    self.Y = 0;
    self.Z = 0;

    self.fillPathBuffer = function (path, topZ, cutterDiameter, cutterAngle, cutterHeight) {
        if (!rasterizePathProgram || !renderHeightMapProgram || !basicProgram)
            return;

        var startTime = Date.now();
        if (options.profile)
            console.log("fillPathBuffer...");

        pathTopZ = topZ;
        cutterDia = cutterDiameter;
        if (cutterAngle <= 0 || cutterAngle > 180)
            cutterAngle = 180;
        cutterAngleRad = cutterAngle * Math.PI / 180;
        isVBit = cutterAngle < 180;
        cutterH = cutterHeight;
        if(isVBit) cutterH = (cutterDia/2)/Math.tan(cutterAngleRad/2); //Calculate corect cone height given radius and angle

        needToCreatePathTexture = true;
        requestFrame();
        var inputStride = 4;
        pathNumPoints = path.length / inputStride;
        var numHalfCircleSegments = 5;

        if (isVBit) {
            pathStride = 12;
            pathVertexesPerLine = 12 + numHalfCircleSegments * 6;
        } else {
            pathStride = 9;
            pathVertexesPerLine = 18;
        }

        pathNumVertexes = pathNumPoints * pathVertexesPerLine;
        var bufferContent = new Float32Array(pathNumPoints * pathStride * pathVertexesPerLine);
        pathBufferContent = bufferContent;

        var minX = path[0];
        var maxX = path[0];
        var minY = path[1];
        var maxY = path[1];
        var minZ = path[2];

        var time = 0;
        for (var point = 0; point < pathNumPoints; ++point) {
            var prevPoint = Math.max(point - 1, 0);
            var pointBegin = point * inputStride;
            var prevPointBegin = prevPoint * inputStride;
            var x = path[pointBegin + 0];
            var y = path[pointBegin + 1];
            var z = path[pointBegin + 2];
            var f = path[pointBegin + 3];
            var prevX = path[prevPointBegin + 0];
            var prevY = path[prevPointBegin + 1];
            var prevZ = path[prevPointBegin + 2];
            var dist = Math.sqrt((x - prevX) * (x - prevX) + (y - prevY) * (y - prevY) + (z - prevZ) * (z - prevZ));
            var beginTime = time;
            time = time + dist / f * 60;

            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            minZ = Math.min(minZ, z);

            if (isVBit) {
                var coneHeight = -Math.min(z, prevZ, 0) + .1;
                var coneDia = coneHeight * 2 * Math.sin(cutterAngleRad / 2) / Math.cos(cutterAngleRad / 2);

                var rotAngle;
                if (x == prevX && y == prevY)
                    rotAngle = 0;
                else
                    rotAngle = Math.atan2(y - prevY, x - prevX);
                var xyDist = Math.sqrt((x - prevX) * (x - prevX) + (y - prevY) * (y - prevY));

                f = function (virtexIndex, command, rawX, rawY, rawZ, rotCos, rotSin, zOffset) {
                    if (typeof zOffset == 'undefined')
                        zOffset = 0;
                    var base = point * pathStride * pathVertexesPerLine + virtexIndex * pathStride;
                    bufferContent[base + 0] = prevX;
                    bufferContent[base + 1] = prevY;
                    bufferContent[base + 2] = prevZ + zOffset;
                    bufferContent[base + 3] = x;
                    bufferContent[base + 4] = y;
                    bufferContent[base + 5] = z + zOffset;
                    bufferContent[base + 6] = beginTime;
                    bufferContent[base + 7] = time;
                    bufferContent[base + 8] = command;
                    bufferContent[base + 9] = rawX * rotCos - rawY * rotSin;
                    bufferContent[base + 10] = rawY * rotCos + rawX * rotSin;
                    bufferContent[base + 11] = rawZ;
                }

                if (Math.abs(z - prevZ) >= xyDist * Math.PI / 2 * Math.cos(cutterAngleRad / 2) / Math.sin(cutterAngleRad / 2)) {
                    //console.log("plunge or retract");
                    // plunge or retract
                    var index = 0;

                    var command = prevZ < z ? 100 : 101;
                    for (var circleIndex = 0; circleIndex < numHalfCircleSegments*2; ++circleIndex) {
                        var a1 = 2 * Math.PI * circleIndex / numHalfCircleSegments/2;
                        var a2 = 2 * Math.PI * (circleIndex + 1) / numHalfCircleSegments/2;
                        f(index++, command, coneDia / 2 * Math.cos(a2), coneDia / 2 * Math.sin(a2), coneHeight, 1, 0);
                        f(index++, command, 0, 0, 0, 1, 0);
                        f(index++, command, coneDia / 2 * Math.cos(a1), coneDia / 2 * Math.sin(a1), coneHeight, 1, 0);
                    }

                    //if (index > pathVertexesPerLine)
                    //    console.log("oops...");
                    while (index < pathVertexesPerLine)
                        f(index++, 200, 0, 0, 0, 1, 0);
                } else {
                    //console.log("cut");
                    // cut
                    var planeContactAngle = Math.asin((prevZ - z) / xyDist * Math.sin(cutterAngleRad / 2) / Math.cos(cutterAngleRad / 2));
                    //console.log("\nxyDist = ", xyDist);
                    //console.log("delta z = " + (z - prevZ));
                    //console.log("planeContactAngle = " + (planeContactAngle * 180 / Math.PI));

                    var index = 0;
                    if (1) {
                        f(index++, 100, 0, -coneDia / 2, coneHeight, Math.cos(rotAngle - planeContactAngle), Math.sin(rotAngle - planeContactAngle));
                        f(index++, 101, 0, -coneDia / 2, coneHeight, Math.cos(rotAngle - planeContactAngle), Math.sin(rotAngle - planeContactAngle));
                        f(index++, 100, 0, 0, 0, 1, 0);
                        f(index++, 100, 0, 0, 0, 1, 0);
                        f(index++, 101, 0, -coneDia / 2, coneHeight, Math.cos(rotAngle - planeContactAngle), Math.sin(rotAngle - planeContactAngle));
                        f(index++, 101, 0, 0, 0, 1, 0);
                        f(index++, 100, 0, 0, 0, 1, 0);
                        f(index++, 101, 0, 0, 0, 1, 0);
                        f(index++, 100, 0, coneDia / 2, coneHeight, Math.cos(rotAngle + planeContactAngle), Math.sin(rotAngle + planeContactAngle));
                        f(index++, 100, 0, coneDia / 2, coneHeight, Math.cos(rotAngle + planeContactAngle), Math.sin(rotAngle + planeContactAngle));
                        f(index++, 101, 0, 0, 0, 1, 0);
                        f(index++, 101, 0, coneDia / 2, coneHeight, Math.cos(rotAngle + planeContactAngle), Math.sin(rotAngle + planeContactAngle));
                    }

                    var startAngle = rotAngle + Math.PI / 2 - planeContactAngle;
                    var endAngle = rotAngle + 3 * Math.PI / 2 + planeContactAngle;
                    for (var circleIndex = 0; circleIndex < numHalfCircleSegments; ++circleIndex) {
                        var a1 = startAngle + circleIndex / numHalfCircleSegments * (endAngle - startAngle);
                        var a2 = startAngle + (circleIndex + 1) / numHalfCircleSegments * (endAngle - startAngle);
                        //console.log("a1,a2: " + (a1 * 180 / Math.PI) + ", " + (a2 * 180 / Math.PI));

                        f(index++, 100, coneDia / 2 * Math.cos(a2), coneDia / 2 * Math.sin(a2), coneHeight, 1, 0);
                        f(index++, 100, 0, 0, 0, 1, 0);
                        f(index++, 100, coneDia / 2 * Math.cos(a1), coneDia / 2 * Math.sin(a1), coneHeight, 1, 0);
                        f(index++, 101, coneDia / 2 * Math.cos(a2 + Math.PI), coneDia / 2 * Math.sin(a2 + Math.PI), coneHeight, 1, 0);
                        f(index++, 101, 0, 0, 0, 1, 0);
                        f(index++, 101, coneDia / 2 * Math.cos(a1 + Math.PI), coneDia / 2 * Math.sin(a1 + Math.PI), coneHeight, 1, 0);
                    }

                    //if (index != pathVertexesPerLine)
                    //    console.log("oops...");
                    //while (index < pathVertexesPerLine)
                    //    f(index++, 200, 0, 0, 0, 1, 0);
                }
            } else {
                for (var virtex = 0; virtex < pathVertexesPerLine; ++virtex) {
                    var base = point * pathStride * pathVertexesPerLine + virtex * pathStride;
                    bufferContent[base + 0] = prevX;
                    bufferContent[base + 1] = prevY;
                    bufferContent[base + 2] = prevZ;
                    bufferContent[base + 3] = x;
                    bufferContent[base + 4] = y;
                    bufferContent[base + 5] = z;
                    bufferContent[base + 6] = beginTime;
                    bufferContent[base + 7] = time;
                    bufferContent[base + 8] = virtex;
                }
            }
        }
        self.totalTime = time;

        console.log("bufferContent (MB): " + bufferContent.length * 4 / 1024 / 1024);

        pathXOffset = -(minX + maxX) / 2;
        pathYOffset = -(minY + maxY) / 2;
        var size = Math.max(maxX - minX + 4 * cutterDia, maxY - minY + 4 * cutterDia);
        pathScale = 2 / size;
        pathMinZ = minZ;

        if (options.profile)
            console.log("fillPathBuffer: " + (Date.now() - startTime));

        requestFrame();
    }

    var pathBuffer;

    self.drawPath = function () {
        if (!rasterizePathProgram || !renderHeightMapProgram || !basicProgram)
            return;

        if (!pathBuffer) {
            pathBuffer = self.gl.createBuffer();
            self.gl.bindBuffer(self.gl.ARRAY_BUFFER, pathBuffer);
            self.gl.bufferData(self.gl.ARRAY_BUFFER, gpuMem, self.gl.DYNAMIC_DRAW);
            self.gl.bindBuffer(self.gl.ARRAY_BUFFER, null);
        }

        self.gl.useProgram(rasterizePathProgram);
        self.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        self.gl.enable(self.gl.DEPTH_TEST);
        self.gl.viewport(0, 0, resolution, resolution);
        self.gl.clear(self.gl.COLOR_BUFFER_BIT | self.gl.DEPTH_BUFFER_BIT);

        self.gl.uniform1f(rasterizePathProgram.resolution, resolution);
        self.gl.uniform1f(rasterizePathProgram.cutterDia, cutterDia);
        self.gl.uniform2f(rasterizePathProgram.pathXYOffset, pathXOffset, pathYOffset);
        self.gl.uniform1f(rasterizePathProgram.pathScale, pathScale);
        self.gl.uniform1f(rasterizePathProgram.pathMinZ, pathMinZ);
        self.gl.uniform1f(rasterizePathProgram.pathTopZ, pathTopZ);
        self.gl.uniform1f(rasterizePathProgram.stopAtTime, stopAtTime);
        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, pathBuffer);
        self.gl.vertexAttribPointer(rasterizePathProgram.pos1, 3, self.gl.FLOAT, false, pathStride * Float32Array.BYTES_PER_ELEMENT, 0);
        self.gl.vertexAttribPointer(rasterizePathProgram.pos2, 3, self.gl.FLOAT, false, pathStride * Float32Array.BYTES_PER_ELEMENT, 3 * Float32Array.BYTES_PER_ELEMENT);
        self.gl.vertexAttribPointer(rasterizePathProgram.startTime, 1, self.gl.FLOAT, false, pathStride * Float32Array.BYTES_PER_ELEMENT, 6 * Float32Array.BYTES_PER_ELEMENT);
        self.gl.vertexAttribPointer(rasterizePathProgram.endTime, 1, self.gl.FLOAT, false, pathStride * Float32Array.BYTES_PER_ELEMENT, 7 * Float32Array.BYTES_PER_ELEMENT);
        self.gl.vertexAttribPointer(rasterizePathProgram.command, 1, self.gl.FLOAT, false, pathStride * Float32Array.BYTES_PER_ELEMENT, 8 * Float32Array.BYTES_PER_ELEMENT);
        self.gl.vertexAttribPointer(rasterizePathProgram.rawPos, 3, self.gl.FLOAT, false, pathStride * Float32Array.BYTES_PER_ELEMENT, 9 * Float32Array.BYTES_PER_ELEMENT);

        self.gl.enableVertexAttribArray(rasterizePathProgram.pos1);
        self.gl.enableVertexAttribArray(rasterizePathProgram.pos2);
        self.gl.enableVertexAttribArray(rasterizePathProgram.startTime);
        self.gl.enableVertexAttribArray(rasterizePathProgram.endTime);
        self.gl.enableVertexAttribArray(rasterizePathProgram.command);
        if(isVBit)
            self.gl.enableVertexAttribArray(rasterizePathProgram.rawPos);

        var numTriangles = pathNumVertexes / 3;
        var lastTriangle = 0;
        var maxTriangles = Math.floor(gpuMem / pathStride / 3 / Float32Array.BYTES_PER_ELEMENT);

        while (lastTriangle < numTriangles) {
            var n = Math.min(numTriangles - lastTriangle, maxTriangles);
            var b = new Float32Array(pathBufferContent.buffer, lastTriangle * pathStride * 3 * Float32Array.BYTES_PER_ELEMENT, n * pathStride * 3);
            self.gl.bufferSubData(self.gl.ARRAY_BUFFER, 0, b);
            self.gl.drawArrays(self.gl.TRIANGLES, 0, n * 3);
            lastTriangle += n;
        }

        self.gl.disableVertexAttribArray(rasterizePathProgram.pos1);
        self.gl.disableVertexAttribArray(rasterizePathProgram.pos2);
        self.gl.disableVertexAttribArray(rasterizePathProgram.startTime);
        self.gl.disableVertexAttribArray(rasterizePathProgram.endTime);
        self.gl.disableVertexAttribArray(rasterizePathProgram.command);
        self.gl.disableVertexAttribArray(rasterizePathProgram.rawPos);

        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, null);
        self.gl.useProgram(null);
    }

    var pathFramebuffer = null;
    var pathRgbaTexture = null;

    self.createPathTexture = function () {
        if (!rasterizePathProgram || !renderHeightMapProgram || !basicProgram)
            return;
        if (!pathFramebuffer) {
            pathFramebuffer = self.gl.createFramebuffer();
            self.gl.bindFramebuffer(self.gl.FRAMEBUFFER, pathFramebuffer);

            pathRgbaTexture = self.gl.createTexture();
            self.gl.activeTexture(self.gl.TEXTURE0);
            self.gl.bindTexture(self.gl.TEXTURE_2D, pathRgbaTexture);
            self.gl.texImage2D(self.gl.TEXTURE_2D, 0, self.gl.RGBA, resolution, resolution, 0, self.gl.RGBA, self.gl.UNSIGNED_BYTE, null);
            self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_MAG_FILTER, self.gl.NEAREST);
            self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_MIN_FILTER, self.gl.NEAREST);
            self.gl.framebufferTexture2D(self.gl.FRAMEBUFFER, self.gl.COLOR_ATTACHMENT0, self.gl.TEXTURE_2D, pathRgbaTexture, 0);
            self.gl.bindTexture(self.gl.TEXTURE_2D, null);

            var renderbuffer = self.gl.createRenderbuffer();
            self.gl.bindRenderbuffer(self.gl.RENDERBUFFER, renderbuffer);
            self.gl.renderbufferStorage(self.gl.RENDERBUFFER, self.gl.DEPTH_COMPONENT16, resolution, resolution);
            self.gl.framebufferRenderbuffer(self.gl.FRAMEBUFFER, self.gl.DEPTH_ATTACHMENT, self.gl.RENDERBUFFER, renderbuffer);
            self.gl.bindRenderbuffer(self.gl.RENDERBUFFER, null);
            self.gl.bindFramebuffer(self.gl.FRAMEBUFFER, null);
        }
        self.gl.bindFramebuffer(self.gl.FRAMEBUFFER, pathFramebuffer);
        self.drawPath();
        self.gl.bindFramebuffer(self.gl.FRAMEBUFFER, null);
        needToCreatePathTexture = false;
        needToDrawHeightMap = true;
    }

    var meshBuffer;
    var meshStride = 9;
    var meshNumVertexes = 0;

    if (self.gl) {
        var numTriangles = resolution * (resolution - 1);
        meshNumVertexes = numTriangles * 3;
        var bufferContent = new Float32Array(meshNumVertexes * meshStride);
        var pos = 0;
        for (var y = 0; y < resolution - 1; ++y)
            for (var x = 0; x < resolution; ++x) {
                var left = x - 1;
                if (left < 0)
                    left = 0;
                var right = x + 1;
                if (right >= resolution)
                    right = resolution - 1;
                if (!(x & 1) ^ (y & 1))
                    for (var i = 0; i < 3; ++i) {
                        bufferContent[pos++] = left;
                        bufferContent[pos++] = y + 1;
                        bufferContent[pos++] = x;
                        bufferContent[pos++] = y;
                        bufferContent[pos++] = right;
                        bufferContent[pos++] = y + 1;
                        if (i == 0) {
                            bufferContent[pos++] = left;
                            bufferContent[pos++] = y + 1;
                        } else if (i == 1) {
                            bufferContent[pos++] = x;
                            bufferContent[pos++] = y;
                        }
                        else {
                            bufferContent[pos++] = right;
                            bufferContent[pos++] = y + 1;
                        }
                        bufferContent[pos++] = i;
                    }
                else
                    for (var i = 0; i < 3; ++i) {
                        bufferContent[pos++] = left;
                        bufferContent[pos++] = y;
                        bufferContent[pos++] = right;
                        bufferContent[pos++] = y;
                        bufferContent[pos++] = x;
                        bufferContent[pos++] = y + 1;
                        if (i == 0) {
                            bufferContent[pos++] = left;
                            bufferContent[pos++] = y;
                        } else if (i == 1) {
                            bufferContent[pos++] = right;
                            bufferContent[pos++] = y;
                        }
                        else {
                            bufferContent[pos++] = x;
                            bufferContent[pos++] = y + 1;
                        }
                        bufferContent[pos++] = i;
                    }
            }

        //bufferContent = new Float32Array([
        //    1,1,126,1,64,126,    0,
        //    1,1,126,1,64,126,    1,
        //    1,1,126,1,64,126,    2,
        //]);
        //meshNumVertexes = 3;

        meshBuffer = self.gl.createBuffer();
        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, meshBuffer);
        self.gl.bufferData(self.gl.ARRAY_BUFFER, bufferContent, self.gl.STATIC_DRAW);
        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, null);
    }

    self.drawHeightMap = function () {
        if (!rasterizePathProgram || !renderHeightMapProgram || !basicProgram)
            return;

        self.gl.useProgram(renderHeightMapProgram);
        self.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        self.gl.enable(self.gl.DEPTH_TEST);
        //var canvasSize = Math.min(canvas.width, canvas.height);
        //self.gl.viewport((canvas.width - canvasSize) / 2, (canvas.height - canvasSize) / 2, canvasSize, canvasSize);
        self.gl.viewport(0, 0, canvas.width, canvas.height);
        if(canvas.width > canvas.height) {
            canvasAspectX=canvas.height/canvas.width;
            canvasAspectY=1;
        } else {
            canvasAspectX=1;
            canvasAspectY=canvas.width/canvas.height;
        }
        self.gl.clear(self.gl.COLOR_BUFFER_BIT | self.gl.DEPTH_BUFFER_BIT);

        self.gl.activeTexture(self.gl.TEXTURE0);
        self.gl.bindTexture(self.gl.TEXTURE_2D, pathRgbaTexture);

        self.gl.uniform2f(renderHeightMapProgram.aspect, canvasAspectX*self.zoom, canvasAspectY*self.zoom);
        self.gl.uniform1f(renderHeightMapProgram.resolution, resolution);
        self.gl.uniform1f(renderHeightMapProgram.pathScale, pathScale);
        self.gl.uniform1f(renderHeightMapProgram.pathMinZ, pathMinZ);
        self.gl.uniform1f(renderHeightMapProgram.pathTopZ, pathTopZ);
        self.gl.uniformMatrix4fv(renderHeightMapProgram.rotate, false, rotate);
        self.gl.uniform1i(renderHeightMapProgram.heightMap, 0);

        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, meshBuffer);
        self.gl.vertexAttribPointer(renderHeightMapProgram.pos0, 2, self.gl.FLOAT, false, meshStride * Float32Array.BYTES_PER_ELEMENT, 0);
        self.gl.vertexAttribPointer(renderHeightMapProgram.pos1, 2, self.gl.FLOAT, false, meshStride * Float32Array.BYTES_PER_ELEMENT, 2 * Float32Array.BYTES_PER_ELEMENT);
        self.gl.vertexAttribPointer(renderHeightMapProgram.pos2, 2, self.gl.FLOAT, false, meshStride * Float32Array.BYTES_PER_ELEMENT, 4 * Float32Array.BYTES_PER_ELEMENT);
        self.gl.vertexAttribPointer(renderHeightMapProgram.thisPos, 2, self.gl.FLOAT, false, meshStride * Float32Array.BYTES_PER_ELEMENT, 6 * Float32Array.BYTES_PER_ELEMENT);
        //self.gl.vertexAttribPointer(renderHeightMapProgram.command, 1, self.gl.FLOAT, false, meshStride * Float32Array.BYTES_PER_ELEMENT, 8 * Float32Array.BYTES_PER_ELEMENT);

        self.gl.enableVertexAttribArray(renderHeightMapProgram.pos0);
        self.gl.enableVertexAttribArray(renderHeightMapProgram.pos1);
        self.gl.enableVertexAttribArray(renderHeightMapProgram.pos2);
        self.gl.enableVertexAttribArray(renderHeightMapProgram.thisPos);
        //self.gl.enableVertexAttribArray(renderHeightMapProgram.command);

        self.gl.drawArrays(self.gl.TRIANGLES, 0, meshNumVertexes);

        self.gl.disableVertexAttribArray(renderHeightMapProgram.pos0);
        self.gl.disableVertexAttribArray(renderHeightMapProgram.pos1);
        self.gl.disableVertexAttribArray(renderHeightMapProgram.pos2);
        self.gl.disableVertexAttribArray(renderHeightMapProgram.thisPos);
        //self.gl.disableVertexAttribArray(renderHeightMapProgram.command);

        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, null);
        self.gl.bindTexture(self.gl.TEXTURE_2D, null);
        self.gl.useProgram(null);

        needToDrawHeightMap = false;
    }

    var cylBuffer, vbitBuffer, crossBuffer;
    var cylStride = 6;
    var cylNumVertexes = 0, vbitNumVertexes = 0;

    if (self.gl) (function () {
        var numDivisions = 40;
        var cylContent = [];
        var vbitContent = [];
        var r = 0.7, g = 0.7, b = 0.0; //COLOR OF CUTTER BIT

        function addVertex(buf, x, y, z) {
            buf.push(x,y,z,r,g,b);
        }

        var lastX = .5 * Math.cos(0);
        var lastY = .5 * Math.sin(0);
        for (var i = 0; i < numDivisions; ++i) {
            var j = i + 1;
            if (j == numDivisions)
                j = 0;
            var x = .5 * Math.cos(j * 2 * Math.PI / numDivisions);
            var y = .5 * Math.sin(j * 2 * Math.PI / numDivisions);

            //V-BIT
                //Side
                addVertex(vbitContent, 0, 0, 0);
                addVertex(vbitContent, x, y, 1);
                addVertex(vbitContent, lastX, lastY, 1);

                //Top of the cutter shank
                addVertex(vbitContent, 0, 0, 1);
                addVertex(vbitContent, lastX, lastY, 1);
                addVertex(vbitContent, x, y, 1);

            //Cylinder
                //Side (upper)
                addVertex(cylContent, lastX, lastY, 0);
                addVertex(cylContent, x, y, 0);
                addVertex(cylContent, lastX, lastY, 1);

                //Side (lower)
                addVertex(cylContent, x, y, 0);
                addVertex(cylContent, x, y, 1);
                addVertex(cylContent, lastX, lastY, 1);

                //Tip of the cutter
                addVertex(cylContent, 0, 0, 0);
                addVertex(cylContent, x, y, 0);
                addVertex(cylContent, lastX, lastY, 0);

                //Top of the cutter shank
                addVertex(cylContent, 0, 0, 1);
                addVertex(cylContent, lastX, lastY, 1);
                addVertex(cylContent, x, y, 1);

            lastX = x;
            lastY = y;
        }

        cylNumVertexes = cylContent.length / cylStride;
        vbitNumVertexes = vbitContent.length / cylStride;

        cylBuffer = self.gl.createBuffer();
        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, cylBuffer);
        self.gl.bufferData(self.gl.ARRAY_BUFFER, new Float32Array(cylContent), self.gl.STATIC_DRAW);
        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, null);

        vbitBuffer = self.gl.createBuffer();
        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, vbitBuffer);
        self.gl.bufferData(self.gl.ARRAY_BUFFER, new Float32Array(vbitContent), self.gl.STATIC_DRAW);
        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, null);

        var crossContent = []
        //crossContent.push(0,0, 0,1,0,0);
        crossContent.push(-0.1,0,0, 0,0,0);
        crossContent.push(0.1,0,0,  1,0,0);
        crossContent.push(0,-0.1,0, 0,0,0);
        crossContent.push(0,0.1,0,  0,1,0);
        crossContent.push(0,0,-0.1, 0,0,0);
        crossContent.push(0,0, 0.1, 0,0,1);
        crossBuffer = self.gl.createBuffer();
        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, crossBuffer);
        self.gl.bufferData(self.gl.ARRAY_BUFFER, new Float32Array(crossContent), self.gl.STATIC_DRAW);
        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, null);
    })();

    function lowerBound(data, offset, stride, begin, end, value) {
        while (begin < end) {
            var i = Math.floor((begin + end) / 2);
            if (data[offset + i * stride] < value)
                begin = i + 1;
            else
                end = i;
        };
        return end;
    }

    function mix(v0, v1, a) {
        return v0 + (v1 - v0) * a;
    }

    self.drawCutter = function () {
        if (!rasterizePathProgram || !renderHeightMapProgram || !basicProgram || pathNumPoints == 0)
            return;

        var i = lowerBound(pathBufferContent, 7, pathStride * pathVertexesPerLine, 0, pathNumPoints, stopAtTime);
        var x, y, z;
        if (i < pathNumPoints) {
            var offset = i * pathStride * pathVertexesPerLine;
            var beginTime = pathBufferContent[offset + 6];
            var endTime = pathBufferContent[offset + 7];
            var ratio;
            if (endTime == beginTime)
                ratio = 0;
            else
                ratio = (stopAtTime - beginTime) / (endTime - beginTime);
            x = mix(pathBufferContent[offset + 0], pathBufferContent[offset + 3], ratio);
            y = mix(pathBufferContent[offset + 1], pathBufferContent[offset + 4], ratio);
            z = mix(pathBufferContent[offset + 2], pathBufferContent[offset + 5], ratio);
        }
        else {
            var offset = (i-1) * pathStride * pathVertexesPerLine;
            x = pathBufferContent[offset + 3];
            y = pathBufferContent[offset + 4];
            z = pathBufferContent[offset + 5];
        }

	self.X = x
	self.Y = y
	self.Z = z

        self.gl.useProgram(basicProgram);

        self.gl.uniform2f(basicProgram.aspect, canvasAspectX*self.zoom, canvasAspectY*self.zoom);
        self.gl.uniform3f(basicProgram.scale, cutterDia * pathScale, cutterDia * pathScale, cutterH * pathScale);
        self.gl.uniform3f(basicProgram.translate, (x + pathXOffset) * pathScale, (y + pathYOffset) * pathScale, (z - pathTopZ) * pathScale);
        self.gl.uniformMatrix4fv(basicProgram.rotate, false, rotate);

        if(isVBit) {
            self.gl.bindBuffer(self.gl.ARRAY_BUFFER, vbitBuffer);
        } else {
            self.gl.bindBuffer(self.gl.ARRAY_BUFFER, cylBuffer);
        }
        self.gl.vertexAttribPointer(basicProgram.vPos, 3, self.gl.FLOAT, false, cylStride * Float32Array.BYTES_PER_ELEMENT, 0);
        self.gl.vertexAttribPointer(basicProgram.vColor, 3, self.gl.FLOAT, false, cylStride * Float32Array.BYTES_PER_ELEMENT, 3 * Float32Array.BYTES_PER_ELEMENT);

        self.gl.enableVertexAttribArray(basicProgram.vPos);
        self.gl.enableVertexAttribArray(basicProgram.vColor);

        if(isVBit) {
            self.gl.drawArrays(self.gl.TRIANGLES, 0, vbitNumVertexes);
        } else {
            self.gl.drawArrays(self.gl.TRIANGLES, 0, cylNumVertexes);
        }

        self.gl.disableVertexAttribArray(basicProgram.vPos);
        self.gl.disableVertexAttribArray(basicProgram.vColor);

        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, null);
        self.gl.useProgram(null);
    }

    self.drawOrigin = function () {
        self.gl.useProgram(basicProgram);

        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, crossBuffer);
        self.gl.vertexAttribPointer(basicProgram.vPos, 3, self.gl.FLOAT, false, cylStride * Float32Array.BYTES_PER_ELEMENT, 0);
        self.gl.vertexAttribPointer(basicProgram.vColor, 3, self.gl.FLOAT, false, cylStride * Float32Array.BYTES_PER_ELEMENT, 3 * Float32Array.BYTES_PER_ELEMENT);

        self.gl.enableVertexAttribArray(basicProgram.vPos);
        self.gl.enableVertexAttribArray(basicProgram.vColor);

        self.gl.uniform2f(basicProgram.aspect, canvasAspectX*self.zoom, canvasAspectY*self.zoom);
        self.gl.uniform3f(basicProgram.translate, (0 + pathXOffset) * pathScale, (0 + pathYOffset) * pathScale, (0 - pathTopZ) * pathScale);
        self.gl.uniform3f(basicProgram.scale, 1, 1, 1);
        //self.gl.uniform3f(basicProgram.translate, 0, 0, 0);

        //console.log(self.gl.getParameter(self.gl.ALIASED_LINE_WIDTH_RANGE));
        //console.log(self.gl.getParameter(self.gl.ALIASED_POINT_SIZE_RANGE));
        self.gl.lineWidth(2);
        self.gl.drawArrays(self.gl.LINES, 0, 6);
        //self.gl.drawArrays(self.gl.POINTS, 0, 1);

        self.gl.disableVertexAttribArray(basicProgram.vPos);
        self.gl.disableVertexAttribArray(basicProgram.vColor);

        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, null);
        self.gl.useProgram(null);
    }

    var pendingRequest = false;
    requestFrame = function () {
        if (!rasterizePathProgram || !renderHeightMapProgram || !basicProgram)
            return;
        if (!pendingRequest) {
            window.requestAnimFrame(self.render, canvas);
            pendingRequest = true;
        }
    }

    self.render = function () {
        if (!rasterizePathProgram || !renderHeightMapProgram || !basicProgram)
            return;

        pendingRequest = true;
        if (needToCreatePathTexture)
            self.createPathTexture();
        if (needToDrawHeightMap) {
            self.drawHeightMap();
            self.drawCutter();
            self.drawOrigin();
        }
        pendingRequest = false;

        //needToCreatePathTexture = true;
        //needToDrawHeightMap = true;
        //stopAtTime += .2;
        //requestFrame();
    }

    self.getStopAtTime = function () {
        return stopAtTime;
    }

    self.setStopAtTime = function (t) {
        stopAtTime = t;
        needToCreatePathTexture = true;
        requestFrame();
    }

    self.getRotate = function () {
        return rotate;
    }

    self.setRotate = function (rot) {
        rotate = rot;
        needToDrawHeightMap = true;
        requestFrame();
    }

    self.getZoom = function () {
        return self.zoom;
    }

    self.setZoom = function (z) {
	if(z > 0.000000001) {
            self.zoom = z;
            needToDrawHeightMap = true;
            requestFrame();
	}
    }

    if (self.gl) {
        loadShader(rasterizePathVertexShaderSrc, self.gl.VERTEX_SHADER, function (shader) {
            rasterizePathVertexShader = shader;
            loadedShader();
        });

        loadShader(rasterizePathFragmentShaderSrc, self.gl.FRAGMENT_SHADER, function (shader) {
            rasterizePathFragmentShader = shader;
            loadedShader();
        });

        loadShader(renderHeightMapVertexShaderSrc, self.gl.VERTEX_SHADER, function (shader) {
            renderHeightMapVertexShader = shader;
            loadedShader();
        });

        loadShader(renderHeightMapFragmentShaderSrc, self.gl.FRAGMENT_SHADER, function (shader) {
            renderHeightMapFragmentShader = shader;
            loadedShader();
        });

        loadShader(basicVertexShaderSrc, self.gl.VERTEX_SHADER, function (shader) {
            basicVertexShader = shader;
            loadedShader();
        });

        loadShader(basicFragmentShaderSrc, self.gl.FRAGMENT_SHADER, function (shader) {
            basicFragmentShader = shader;
            loadedShader();
        });
    }
}

function startRenderPath(options, canvas, timeSliderElement, shaderDir, ready) {
    var renderPath;

    /* Show selected time
    var timeSlider;
    if (timeSliderElement)
        timeSlider = timeSliderElement.slider({
            formater: function (value) {
                if (renderPath)
                    return 'Time: ' + Math.round(value / timeSliderElement.attr("max") * renderPath.totalTime) + 's';
                else
                    return value;
            }
        });
    */

    renderPath = new RenderPath(options, canvas, shaderDir, function (renderPath) {
        renderPath.fillPathBuffer([], 0, 0, 180, 0);

        var mouseDown = false;
        var lastX = 0;
        var lastY = 0;

        var origRotate = mat4.create();
        canvas.addEventListener('mousedown', function (e) {
            e.preventDefault();
            mouseDown = true;
            lastX = e.pageX;
            lastY = e.pageY;
            mat4.copy(origRotate, renderPath.getRotate());
        });

        canvas.addEventListener('wheel', function(e) {
          if (e.deltaY !== 0) {
            if (e.deltaY < 0) {
              renderPath.setZoom(renderPath.getZoom() - 0.1);
              //console.log('zoom up '+renderPath.zoom);
            } else {
              renderPath.setZoom(renderPath.getZoom() + 0.1);
              //console.log('zoom down '+renderPath.zoom);
            }
            e.preventDefault();
          }
        });

        document.addEventListener('mousemove', function (e) {
            if (!mouseDown)
                return;
            var m = mat4.create();
            mat4.rotate(m, m, Math.sqrt((e.pageX - lastX) * (e.pageX - lastX) + (e.pageY - lastY) * (e.pageY - lastY)) / 100, [e.pageY - lastY, e.pageX - lastX, 0]);
            mat4.multiply(m, m, origRotate);
            renderPath.setRotate(m);
        });

        document.addEventListener('mouseup', function (e) {
            mouseDown = false;
        });

        canvas.addEventListener('resize', function () {
            needToDrawHeightMap = true;
            requestFrame();
        });

	/*
        if (timeSliderElement)
            timeSliderElement.on("input change",  function () {
		//alarm("change!");
                renderPath.setStopAtTime(timeSliderElement.val() / timeSliderElement.attr("max") * renderPath.totalTime);
            });
	*/

        if(ready) ready(renderPath);
    });

    return renderPath;
}

function startRenderPathDemo() {
    var renderPath;
    renderPath = startRenderPath({}, document.querySelector("#renderPathCanvas")[0], document.querySelector('#timeSlider'), 'js', function (renderPath) {
        fetch("logo-gcode.txt").then((response) => response.text()).then((text) => {
            renderPath.fillPathBuffer(jscut.parseGcode({}, text), 0, .125, 180, 1);
        });
    });
}
