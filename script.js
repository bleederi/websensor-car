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
'use strict';

/* Globals */
var xcoord_div = document.getElementById("xcoord");
var ycoord_div = document.getElementById("ycoord");
var roll_div = document.getElementById("roll");
var pitch_div = document.getElementById("pitch");
var yaw_div = document.getElementById("yaw");
var direction_div = document.getElementById("direction");
var force_div = document.getElementById("force");
var ut; //debug text update var
var mv; //movement update var

var canvas = document.getElementById("canvas");
var ctx = canvas.getContext("2d");

var latitude = null;
var longitude = null;
const GRAVITY = 9.81;
var orientationMat = new Float64Array([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);     //device orientation
var sensorfreq = 60;

var orientation_sensor = null;

var mode = "portrait";

var roll = null;
var pitch = null;
var yaw = null;

var direction = null;
var force = null;

var ballRadius = 5;

//Rendering vars (Three.JS)
var scene = null;
var sphere = null;
var video = null;
var videoF = null;
var videoB = null;
var videoTexture = null;
var sphereMaterial = null;
var sphereMesh = null;

var x = 0;      //car x coordinate
var y = 0;      //car y coordinate
var speed = 5;
var angle = 0;
var mod = 0;

//Sensor classes and low-pass filter
class AbsOriSensor {
        constructor() {
        const sensor = new AbsoluteOrientationSensor({ frequency: sensorfreq });
        const mat4 = new Float32Array(16);
        const euler = new Float32Array(3);
        sensor.onchange = () => {
                sensor.populateMatrix(mat4);
                toEulerianAngle(sensor.quaternion, euler);      //From quaternion to Eulerian angles
                this.roll = euler[0];
                this.pitch = euler[1];
                this.yaw = euler[2];
                if (this.onchange) this.onchange();
        };
        sensor.onactivate = () => {
                if (this.onactivate) this.onactivate();
        };
        const start = () => sensor.start();
        Object.assign(this, { start });
        }
}
class LowPassFilterData {       //https://w3c.github.io/motion-sensors/#pass-filters
  constructor(reading, bias) {
    Object.assign(this, { x: reading.x, y: reading.y, z: reading.z });
    this.bias = bias;
  }
        update(reading) {
                this.x = this.x * this.bias + reading.x * (1 - this.bias);
                this.y = this.y * this.bias + reading.y * (1 - this.bias);
                this.z = this.z * this.bias + reading.z * (1 - this.bias);
        }
}

//WINDOWS 10 HAS DIFFERENT CONVENTION: Yaw z, pitch x, roll y
function toEulerianAngle(quat, out)
{
        const ysqr = quat[1] ** 2;

        // Roll (x-axis rotation).
        const t0 = 2 * (quat[3] * quat[0] + quat[1] * quat[2]);
        const t1 = 1 - 2 * (ysqr + quat[0] ** 2);
        out[0] = Math.atan2(t0, t1);
        // Pitch (y-axis rotation).
        let t2 = 2 * (quat[3] * quat[1] - quat[2] * quat[0]);
        t2 = t2 > 1 ? 1 : t2;
        t2 = t2 < -1 ? -1 : t2;
        out[1] = Math.asin(t2);
        // Yaw (z-axis rotation).
        const t3 = 2 * (quat[3] * quat[2] + quat[0] * quat[1]);
        const t4 = 1 - 2 * (ysqr + quat[2] ** 2);
        out[2] = Math.atan2(t3, t4);
        return out;
}

function updateText()   //For updating debug text
{
        roll_div.innerHTML = roll;
        pitch_div.innerHTML = pitch;
        yaw_div.innerHTML = yaw;
        direction_div.innerHTML = direction;
        force_div.innerHTML = force;
        xcoord_div.innerHTML = x;
        ycoord_div.innerHTML = y;
}

function getDirection(roll, pitch, yaw, mode="landscape")    //Returns the direction the car is turning towards
{
        if(mode == "landscape")
        {
                direction = "todo";
        }
        else
        {
                if(pitch < 0)
                {       
                        direction = "left";
                }
                else
                {
                        direction = "right";
                }
        }
        return direction;
}

function getForce(roll, pitch, yaw, mode="landscape")    //Returns the force the car will be turning with
{
        if(mode == "landscape")
        {
                direction = "todo";
        }
        else
        {
                if(pitch < 0)
                {       
                        force = -pitch;
                }
                else
                {
                        force = pitch;
                }
        }
        return force;
}

function move() //Moves the car
{
        if(direction == "left")
        {
                x = x - force;
        }
        else if (direction == "right")
        {
                x = x + force;
        }
}

function drawBall() {
    ctx.beginPath();
    ctx.arc(x, y, ballRadius, 0, Math.PI*2);
    ctx.fillStyle = "#0095DD";
    ctx.fill();
    ctx.closePath();
}

//The custom element where the game will be rendered
customElements.define("game-view", class extends HTMLElement {
        constructor() {
        super();

        //THREE.js render stuff
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);

        scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);
        this.camera.target = new THREE.Vector3(0, 0, 0);

        sphere = new THREE.SphereGeometry(100, 100, 40);
        sphere.applyMatrix(new THREE.Matrix4().makeScale(-1, 1, 1));

        //videoTexture = new THREE.Texture(video);
        //videoTexture.minFilter = THREE.LinearFilter;
        //videoTexture.magFilter = THREE.LinearFilter;
        //videoTexture.format = THREE.RGBFormat;

        //sphereMaterial = new THREE.MeshBasicMaterial( { map: videoTexture, overdraw: 0.5 } );
        //sphereMesh = new THREE.Mesh(sphere, sphereMaterial);
        //scene.add(sphereMesh);
        }

        connectedCallback() {
                try {
                //Initialize sensors
                orientation_sensor = new AbsOriSensor();
                orientation_sensor.onchange = () => {
                        roll = orientation_sensor.roll;
                        pitch = orientation_sensor.pitch;
                        yaw = orientation_sensor.yaw;
                };
                orientation_sensor.onactivate = () => {
                };
                orientation_sensor.start();
                }
                catch(err) {
                        console.log(err.message);
                        console.log("Your browser doesn't seem to support generic sensors. If you are running Chrome, please enable it in about:flags.");
                        this.innerHTML = "Your browser doesn't seem to support generic sensors. If you are running Chrome, please enable it in about:flags";
                }
                this.render();
                ut = setInterval(updateText, 1000);
                mv = setInterval(move, 100);
        }

        render() {
                direction = getDirection(roll, pitch, yaw, mode);
                force = getForce(roll, pitch, yaw, mode);
                drawBall();
                // Render loop
                this.renderer.render(scene, this.camera);
                requestAnimationFrame(() => this.render());
        }

});

/*
canvas = document.getElementById("canvas");
context = canvas.getContext("2d");
car = new Image();
car.src = "https://i.imgur.com/uwApbV7.png";

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

*/

function magnitude(vector)      //Calculate the magnitude of a vector
{
return Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
}
