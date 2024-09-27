# Lightweight 3-Axis CNC G-Code Simulator

![Screenshot Suzanne](screenshot.jpg)

## [CLICK HERE TO TRY NOW!](https://harvie.github.io/cnc-simulator)

### Origins
This simulator was part of [JSCut](https://jscut.org/) discontinued CAM package which was developed since 2014 by [Todd Fleming](https://github.com/tbfleming/jscut).

During 2024-09 it was isolated and modified to be useful in offline/standalone context by [Tomas Mudrunka](https://github.com/harvie).

Similar project used to be available since 2016-05 at www.cncwebtools.com/Apps/GCode_Simulator/index.html but features were limited and the website is defunct since 2020-08.

### Features
 * Load g-code from file
 * Pass settings and G-Code via URL
 * Support for arcs (G02, G03, XY plane only, IJ reccomended, R experimental)
 * Animation
 * Works offline (no webserver needed, copy at archive.org wayback machine also works)
 * V-Carving
 * Visualize origin point
 * Show current coordinates
 * Mouse wheel zooming
 * Non-square viewport supported

### TODO
 * Shaded milling bit
 * weird V-Bit behaviour when Surface Z > 0 (perhaps we should just transpose Z when parsing g-code, and fix origin crosshair...)
 * 3D view translating?
 * Support for mm/inch (bit settings and G21, G20)
 * Support for ball nose and radiused milling bits
 * Tool library and toolchanges (eg. T1 M6)

### See also
 * https://camotics.org/
 * https://github.com/vlachoudis/bCNC
 * https://github.com/LaserWeb/LaserWeb4
 * https://harvie.github.io/cnc-simulator
 * https://raw.githack.com/Harvie/cnc-simulator/master/index.html
