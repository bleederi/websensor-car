/*
 * Websensor Car Game
 * https://github.com/jessenie-intel/websensor-car
 *
 * Copyright (c) 2017 Jesse Nieminen
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.


Code from http://ucfcdl.github.io/html5-tutorial/ has been used in creating this demo
*/

x = 0;
y = 0;
speed = 5;
angle = 0;
mod = 0;

var orientationMat = new Float64Array([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);     //orientation
var angles = {alpha:null, beta:null, gamma:null};
var oangles = {alpha:null, beta:null, gamma:null};      //Original angles, represent the original orientation
var sensors = {};
var accel = {x:null, y:null, z:null};
//var accelNoG;
var velGyro;
var sensorfreq = 60;    //for setting desired sensor frequency

//var textUpdate = setInterval(update_text, 1000/sensorfreq);

canvas = document.getElementById("canvas");
context = canvas.getContext("2d");
car = new Image();
car.src = "http://i.imgur.com/uwApbV7.png";

window.addEventListener("keydown", keypress_handler, false);
window.addEventListener("keyup", keyup_handler, false);

var moveInterval = setInterval(function () {
    draw();
}, 30);

function draw() {
    context = canvas.getContext("2d");
    context.clearRect(0, 0, 800, 800);

    context.fillStyle = "rgb(200, 100, 220)";
    context.fillRect(50, 50, 100, 100);

    x += (speed * mod) * Math.cos(Math.PI / 180 * angle);
    y += (speed * mod) * Math.sin(Math.PI / 180 * angle);

    context.save();
    context.translate(x, y);
    context.rotate(Math.PI / 180 * angle);
    context.drawImage(car, -(car.width / 2), -(car.height / 2));
    context.restore();
}

function keyup_handler(event) {
    if (event.keyCode == 87 || event.keyCode == 83) {
        mod = 0;
    }
}

function keypress_handler(event) {
    console.log(event.keyCode);
    if (event.keyCode == 87) {
        mod = 1;
    }
    if (event.keyCode == 83) {
        mod = -1;
    }
    if (event.keyCode == 65) {
        angle -= 5;
    }
    if (event.keyCode == 68) {
        angle += 5;
    }
}

function convert_orientation(orimatrix) {        //Convert orientation matrix to Euler angles
        let alpha = 0;
        let beta = 0;
        let gamma = 0;
        let r11 = orimatrix[0]
        let r21 = orimatrix[4]
        let r31 = orimatrix[8]
        let r32 = orimatrix[9]
        let r33 = orimatrix[10]
        let betadivisor = Math.sqrt(Math.pow(r32,2) + Math.pow(r33,2));
        if(r11 != 0 && r33 != 0 && betadivisor != 0) { //Can't divide by zero
                alpha = Math.atan2(r21, r11);
                beta = Math.atan2(-r31, (Math.sqrt(Math.pow(r32,2) + Math.pow(r33,2))));
                gamma = Math.atan2(r32, r33);
        }        
        angles.alpha = alpha;
        angles.beta = beta;
        angles.gamma = gamma;
        return angles;  //from -pi to pi
}

function update_text()
{
if (accel && orientationMat && velGyro)  //only update if all data available
        {
                        document.getElementById("accl").textContent = `Acceleration ${accel.x.toFixed(3)}, ${accel.y.toFixed(3)}, ${accel.z.toFixed(3)} Magnitude: ${magnitude(accel).toFixed(3)}`;
                        //document.getElementById("accl_nog").textContent = `Acceleration without gravity ${accelNoG.x.toFixed(3)}, ${accelNoG.y.toFixed(3)}, ${accelNoG.z.toFixed(3)} Magnitude: ${magnitude(accelNoG).toFixed(3)}`;
                        //document.getElementById("g_accl").textContent = `Isolated gravity ${gravity.x.toFixed(3)}, ${gravity.y.toFixed(3)}, ${gravity.z.toFixed(3)} Magnitude: (${magnitude(gravity).toFixed(3)}))`;
                        document.getElementById("ori").textContent = `Orientation matrix ${orientationMat[0]} ${orientationMat[1]} ${orientationMat[2]} ${orientationMat[3]} \n ${orientationMat[4]} ${orientationMat[5]} ${orientationMat[6]} ...`;
                        document.getElementById("rrate").textContent = `Rotation rate (${velGyro.x.toFixed(3)}, ${velGyro.y.toFixed(3)}, ${velGyro.z.toFixed(3)} Magnitude: ${magnitude(velGyro).toFixed(3)}`;
                        document.getElementById("sensorfreq").textContent = `Sensor frequency ${sensorfreq}`;
        }
}

function startSensors() {
        try {
        //Accelerometer including gravity
        accelerometer = new Accelerometer({ frequency: sensorfreq, includeGravity: true });
        sensors.Accelerometer = accelerometer;
        //gravity =  new LowPassFilterData(accelerometer, 0.8);
        accelerometer.onchange = event => {
                accel = {x:accelerometer.x, y:accelerometer.y, z:accelerometer.z};
                //gravity.update(accel);
                //accelNoG = {x:accel.x - gravity.x, y:accel.y - gravity.y, z:accel.z - gravity.z};
        }
        accelerometer.onerror = err => {
          accelerometer = null;
          console.log(`Accelerometer ${err.error}`)
        }
        accelerometer.start();
        //AbsoluteOrientationSensor
        absoluteorientationsensor = new AbsoluteOrientationSensor({ frequency: sensorfreq});
        sensors.AbsoluteOrientationSensor = absoluteorientationsensor;
        absoluteorientationsensor.onchange = event => {
                absoluteorientationsensor.populateMatrix(orientationMat);
                angles = convert_orientation(orientationMat);
                //console.log(angles);
                //We need the original orientation for the turning to be orientation-independent
                if(oangles.alpha == null && oangles.beta == null && oangles.gamme == null)
                {
                        oangles = angles;
                }
        }
        absoluteorientationsensor.onerror = err => {
          absoluteorientationsensor = null;
          console.log(`Absolute orientation sensor ${err.error}`)
        };
        absoluteorientationsensor.start();
        //Gyroscope
        gyroscope = new Gyroscope({ frequency: sensorfreq});
        sensors.Gyroscope = gyroscope;
        gyroscope.onchange = event => {
                velGyro = {x:gyroscope.x, y:gyroscope.y, z:gyroscope.z};
        }
        gyroscope.onerror = err => {
          gyroscope = null;
          console.log(`Gyroscope ${err.error}`)
        };
        gyroscope.start();
        } catch(err) { console.log(err); }
        sensors_started = true;
        return sensors;
        }

startSensors();
