// Copyright 2014 Todd Fleming
//
// This file is part of jscut.
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

var jscut = jscut || {};
jscut.parseGcode = function (options, gcode, arcPrecision) {
    "use strict";

    arcPrecision = arcPrecision || 0.1;

    var startTime = Date.now();
    if (options.profile)
        console.log("parseGcode...");

    var path = [];
    var lastX = NaN, lastY = NaN, lastZ = NaN, lastF = NaN;
    var stride = 4;
    var i = 0;
    while (i < gcode.length) (function () {
        function parse() {
            ++i;
            while (i < gcode.length && (gcode[i] == ' ' || gcode[i] == '\t'))
                ++i;
            var begin = i;
            while (i < gcode.length && "+-.0123456789".indexOf(gcode[i]) != -1)
                ++i;
            return Number(gcode.substr(begin, i - begin));
        }
        var g = NaN, x = NaN, y = NaN, z = NaN, f = NaN, I = NaN, J = NaN, K = NaN, R = NaN;
        while (i < gcode.length && gcode[i] != ';' && gcode[i] != '\r' && gcode[i] != '\n' && gcode[i] != '(') {
            if (gcode[i] == 'G' || gcode[i] == 'g')
                g = parse();
            else if (gcode[i] == 'X' || gcode[i] == 'x')
                x = parse();
            else if (gcode[i] == 'Y' || gcode[i] == 'y')
                y = parse();
            else if (gcode[i] == 'Z' || gcode[i] == 'z')
                z = parse();
            else if (gcode[i] == 'F' || gcode[i] == 'f')
                f = parse();
            else if (gcode[i] == 'I' || gcode[i] == 'i')
                I = parse();
            else if (gcode[i] == 'J' || gcode[i] == 'j')
                J = parse();
            else if (gcode[i] == 'K' || gcode[i] == 'k')
                K = parse();
            else if (gcode[i] == 'R' || gcode[i] == 'r')
                R = parse();
            else
                ++i;
        }

        if (g == 0 || g == 1) { //Straight line
            if (!isNaN(x)) {
                if (isNaN(lastX))
                    for (var j = 0; j < path.length; j += stride)
                        path[j] = x;
                lastX = x;
            }
            if (!isNaN(y)) {
                if (isNaN(lastY))
                    for (var j = 1; j < path.length; j += stride)
                        path[j] = y;
                lastY = y;
            }
            if (!isNaN(z)) {
                if (isNaN(lastZ))
                    for (var j = 2; j < path.length; j += stride)
                        path[j] = z;
                lastZ = z;
            }
            if (!isNaN(f)) {
                if (isNaN(lastF))
                    for (var j = 3; j < path.length; j += stride)
                        path[j] = f;
                lastF = f;
            }
	            path.push(lastX);
        	    path.push(lastY);
            	    path.push(lastZ);
            	    path.push(lastF);


      } else if (g == 2 || g == 3) { //Arc or Circle

    		//console.log("LAST: X" + lastX + " Y" + lastY + " Z" + lastZ);
    		//console.log("G" + g + " X" + x + " Y" + y + " Z" + z + " I" + I + " J" + J + " K" + K + " R" + R);

		if(!isNaN(R) || !isNaN(K)) console.log("G02/G03 K and R are not supported. Only I and J can be used for now.")
		if(isNaN(I) && !isNaN(J)) I=0;
		if(isNaN(J) && !isNaN(I)) J=0;

    		var clockwise = (g == 2);
    		var centerX = lastX + I;
    		var centerY = lastY + J;
    		//var centerZ = lastZ + K;
    		var radius = Math.sqrt(Math.pow(lastX - centerX, 2) + Math.pow(lastY - centerY, 2));

    		var startAngle = Math.atan2(lastY - centerY, lastX - centerX);
    		var endAngle = Math.atan2(y - centerY, x - centerX);

    	// Correct the angle difference based on the direction of the arc
    	let angleDiff = endAngle - startAngle;
    	if (clockwise) {
        	if (angleDiff >= 0) angleDiff -= 2 * Math.PI;  // Ensure the angle is negative for clockwise
    	} else {
        	if (angleDiff <= 0) angleDiff += 2 * Math.PI;  // Ensure the angle is positive for counterclockwise
    	}

    	var arcLength = Math.abs(angleDiff * radius);  // Arc length based on angle
    	var steps = Math.ceil(arcLength / arcPrecision);  // Number of steps based on precision

    	for (let i = 1; i <= steps; i++) {
        	var currentAngle = startAngle + (angleDiff * i) / steps;
        	var interpX = centerX + radius * Math.cos(currentAngle);  // Interpolated X
        	var interpY = centerY + radius * Math.sin(currentAngle);  // Interpolated Y
		var interpZ = lastZ + ((z-lastZ)*i)/steps;
		if(isNaN(interpZ)) interpZ=lastZ;

        	// Add interpolated point to the path
		//console.log("INTER: X" + interpX + " Y" + interpY + " Z" + interpZ);
        	path.push(interpX);
        	path.push(interpY);
        	path.push(interpZ);  //FIXME: Assuming Z remains constant for the arc
        	path.push(lastF); //Ignore F
    	}

    	// Update last position to final arc endpoint
    	lastX = x;
    	lastY = y;
    	lastZ = z;
	}


        while (i < gcode.length && gcode[i] != '\r' && gcode[i] != '\n')
            ++i;
        while (i < gcode.length && (gcode[i] == '\r' || gcode[i] == '\n'))
            ++i;
    })();

    if (options.profile)
        console.log("parseGcode: " + (Date.now() - startTime));

    return path;
}
