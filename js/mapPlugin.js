/**
 * Created by em.hz on 2016/10/24.
 */
//自定义HashMap
var HashMap = function () {
    var hashMap = {
        set: function (key, value) {
            this[key] = value
        },
        get: function (key) {
            return this[key]
        },
        contains: function (key) {
            return this.get(key) == null ? false : true
        },
        remove: function (key) {
            delete this[key]
        }
    }
    return hashMap;
}

/**
 * 在指定的元素id内创建指定层级的canvas
 * @param eleId
 * @param layer
 * @returns {fabric.Element}
 */
var createCanvas = function (eleId, layer, selectable) {
    var parentDoc = document.getElementById(eleId);
    var canvas = document.createElement('canvas');
    canvas.id = "" + eleId + layer;
    canvas.width = (parentDoc.style.width ? parentDoc.style.width : parentDoc.width ).split('px')[0];
    canvas.height = (parentDoc.style.height ? parentDoc.style.height : parentDoc.height).split('px')[0];
    canvas.style.zIndex = layer;
    canvas.style.position = "absolute";
    canvas.style.left = 0;
    canvas.style.top = 0;
    canvas.style.width = canvas.width;
    canvas.style.height = canvas.height;
    parentDoc.appendChild(canvas);
    var fabricCanvas = new fabric.Canvas(canvas.id);
    return fabricCanvas;
}
var createScaleDiv = function (eleId, mapName) {
    var parentDoc = document.getElementById(eleId);
    var scaleDiv = document.createElement('div');
    scaleDiv.id = "scalebox";
    scaleDiv.width = (parentDoc.style.width ? parentDoc.style.width : parentDoc.width ).split('px')[0];
    scaleDiv.style = "position: absolute;top: 5px;right: 5px;z-index: 1000;background-color: white";
    scaleDiv.setAttribute("class", "zdeps-1 usel");
    scaleDiv.innerHTML = "<div class='zoom_map zoom_in_map' type='in' onclick='" + mapName + ".zoomOut()'></div>" +
        "<div class='zoom_map zoom_out_map' type='out' onclick='" + mapName + ".zoomIn()'></div>"
    parentDoc.appendChild(scaleDiv);
}
/**
 * 地图插件
 * @param eleId
 * @param options
 * @returns {{}}
 */
var mapPlugin = function (eleId, options, mapName) {
    var map = {};
    map.positionsMap = HashMap();
    map.eleId = eleId;
    createScaleDiv(eleId, mapName); //scale box
    map.backCanvas = createCanvas(eleId, 0, false); //地图背景canvas
    map.dynamicPositionCanvas = createCanvas(eleId, 2, true); //动态canvas用于加载要定位的点
    map.width = 0;  //地图宽度
    map.height = 0; //地图高度
    map.offsetX = 0; //横向偏移，用于背景长宽比例大于整个地图时
    map.offsetY = 0; //纵向偏移，用于背景长宽比例小于整个地图时
    map.minX = 0; //背景最小x坐标|
    map.maxX = 0; //背景最大x坐标 |>
    map.minY = 0; //背景最小y坐标 |  这四个坐标用于将地图点的真实坐标转换为屏幕坐标
    map.maxY = 0; //背景最大y坐标|
    map.fixedPositions = []; //地图固定点，用于显示不动的点以及通过自动计算设置地图坐标比例
    map.dynamicPositions = []; //地图活动点，用于显示移动的定位目标
    map.positions = []; //地图点集合，是定点与活动点的集合
    map.paused = true; //暂停刷新标志,目前未生效
    map.loadImg = 0; //正在加载图片数量
    map.overOffset = 5; //鼠标划过事件时，如果使用默认划过目标变大，此处为变大的像素数
    map.refreshTimeId = ''; //加载图片定时器的标识
    map.infoDivPos = {left: 0, top: 0};
    map.maxZoom = 2;
    map.minZoom = 1;
    map.isMoving = false;
    /**
     * 创建唯一标记
     */
    map.uuid = function () {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };
    /**
     * 创建地图坐标点
     * @param position
     * @returns {{}}
     */
    map.makePosition = function (position, positionType) {
        var mapPosition = {};

        if (position && position instanceof Object) {
            mapPosition.x = undefined != position['x'] ? position['x'] : null;
            mapPosition.y = undefined != position['y'] ? position['y'] : null;
            mapPosition.trueX = undefined != position['trueX'] ? position['trueX'] : null;
            mapPosition.trueY = undefined != position['trueY'] ? position['trueY'] : null;
            mapPosition.type = undefined != position['type'] ? position['type'] : '';
            var type = position['type'];
            options = position['options'];
            if (options) {
                mapPosition.title = options['title'];
                mapPosition.desc = options['desc'];
                if ('circle' == type) {
                    mapPosition.offsetX = options['r'];
                    mapPosition.offsetY = options['r'];
                    mapPosition.color = options['color'];
                } else {
                    mapPosition.offsetX = options['width'] / 2.0;
                    mapPosition.offsetY = options['height'] / 2.0;
                    mapPosition.width = options['width'];
                    mapPosition.height = options['height'];
                }
                mapPosition.moveAction = undefined != options['moveAction'] ? options['moveAction'] : '';
                mapPosition.outAction = undefined != options['outAction'] ? options['outAction'] : '';
                mapPosition.clickAction = undefined != options['clickAction'] ? options['clickAction'] : '';
                mapPosition.extendId = undefined != options['extendId'] ? options['extendId'] : map.uuid();
                options['extendId'] = mapPosition.extendId;
                mapPosition.positionType = undefined != positionType ? positionType : 'D';
                mapPosition.selectable = undefined != options['selectable'] ? options['selectable'] : false;
                if ('img' == type) {
                    mapPosition.src = options['src'];
                }
            }
        }
        map.positionsMap.set(mapPosition.extendId, mapPosition);
        return mapPosition;
    }
    /**
     * 计算背景地图信息，包括长宽以及偏移
     * @param backWidth
     * @param backHeight
     * @param width
     * @param height
     * @returns {{top: number, left: number, width: number, height: number}}
     */
    map.calcImgInfo = function (backWidth, backHeight, width, height) {
        var imgInfo = {top: 0, left: 0, width: 0, height: 0};
        if (backWidth && backWidth > 0 && backHeight && backHeight > 0 && width && width > 0 && height && height > 0) {
            if ((backHeight * 1.0) / height < (backWidth * 1.0) / width) {
                imgInfo.width = width / 1.0;
                imgInfo.height = imgInfo.width * (backHeight / backWidth);
                imgInfo.top = (height - imgInfo.height) / 2.0;
                map.offsetY = imgInfo.top;
            } else {
                imgInfo.height = height / 1.0;
                imgInfo.width = imgInfo.height * (backWidth / backHeight);
                imgInfo.left = (width - imgInfo.width) / 2.0;
                map.offsetX = imgInfo.left;
            }
        }
        return imgInfo;
    }
    /**
     * 地图初始化方法，绑定事件并显示已经添加的点
     * @param eleId
     * @param options
     */
    map.init = function (eleId, options) {
        map.width = document.getElementById(eleId).style.width.split("px")[0];
        map.height = document.getElementById(eleId).style.height.split("px")[0];
        map.infoDivPos = undefined != options['infoDivPos'] ? undefined != options['infoDivPos'] : map.infoDivPos;
        map.dynamicPositionCanvas.on('mouse:over', function (e) {
            if (e.target.get('moveAction') && "" != e.target.get('moveAction')) {
                eval(e.target.get('moveAction') + "(e.target)");
            } else {
                var r = e.target.get('radius');
                var width = e.target.get('width');
                var height = e.target.get('height');
                if (null == r) {
                    e.target.set({
                        srcWidth: width,
                        srcHeight: height,
                        width: width + map.overOffset,
                        height: height + map.overOffset
                    });
                } else {
                    e.target.set({srcRadius: r, radius: r + map.overOffset});
                }
                map.dynamicPositionCanvas.renderAll();
            }
        });
        map.dynamicPositionCanvas.on('mouse:out', function (e) {
            if (e && e.target && null != e.target) {
                if (e.target.get('outAction') && "" != e.target.get('outAction')) {
                    eval(e.target.get('outAction') + "(e.target)");
                } else {
                    var r = e.target.get('srcRadius');
                    var width = e.target.get('srcWidth');
                    var height = e.target.get('srcHeight');
                    if (null == r && null != width && null != height) {
                        e.target.set({width: width, height: height});
                    } else if (null != r) {
                        e.target.set({radius: r});
                    }
                    map.dynamicPositionCanvas.renderAll();
                }
            }
        });
        map.dynamicPositionCanvas.on('mouse:up', function (e) {
            if (e) {
                if (e.target && null != e.target) {
                    if (e.target.get('clickAction') && "" != e.target.get('clickAction')) {
                        eval(e.target.get('clickAction') + "(e.target)");
                    }
                }
                else {
                    map.setCursor("default");
                    map.isMoving = false;
                }
            }
        });
        map.dynamicPositionCanvas.on('mouse:down', function (e) {
            if (e) {
                if (e.target && null != e.target) {
                    //do nothing
                }
                else {
                    map.setCursor("pointer");
                    map.isMoving = true;
                }
            }
        });
        //拖动事件
        map.dynamicPositionCanvas.on('mouse:move', function (e) {
            if (e && map.isMoving) {
                if (e.target && null != e.target) {
                    //do nothing
                }
                else {
                    map.setCursor("pointer");
                    var x = 0;
                    var y = 0;
                    if (e.e.movementX < 0) {
                        if (map.width * 1.0 * (map.dynamicPositionCanvas.getZoom() - 1) - Math.abs(map.dynamicPositionCanvas.viewportTransform[4]) > 0) {
                            x = e.e.movementX;
                        }
                    } else {
                        if (map.dynamicPositionCanvas.viewportTransform[4] < 0) {
                            x = e.e.movementX;
                        }
                    }
                    if (e.e.movementY < 0) {
                        if (map.height * 1.0 * (map.dynamicPositionCanvas.getZoom() - 1) - Math.abs(map.dynamicPositionCanvas.viewportTransform[5]) > 0) {
                            y = e.e.movementY;
                        }
                    } else {
                        if (map.dynamicPositionCanvas.viewportTransform[5] < 0) {
                            y = e.e.movementY;
                        }
                    }
                    var delta = new fabric.Point(x, y);
                    map.dynamicPositionCanvas.relativePan(delta);
                    map.backCanvas.relativePan(delta);
                }
            }
        });
        map.dynamicPositionCanvas.on('object:moving', function (e) {
            if (undefined != e && undefined != e.target && undefined != e.target.extendId && "" != e.target.extendId) {
                var nowPostion = map.positionsMap.get(e.target.extendId);
                nowPostion['trueX'] = e.target.left + nowPostion['offsetX'];
                nowPostion['trueY'] = e.target.top + nowPostion['offsetY'];
            }
        })
        if (options['imgSrc'] && "" != options['imgSrc']) {
            map.setBackgroundImage(options['imgSrc'], options['imgWidth'], options['imgHeight']);
        }
        if (options['fixedPositions'] && "" != options['fixedPositions']) {
            map.addFixedPosition(options['fixedPositions']);
        }
        if (undefined != options['maxZoom'] && null != options['maxZoom']) {
            map.maxZoom = options['maxZoom'];
        }
        if (undefined != options['minZoom'] && null != options['minZoom']) {
            map.maxZoom = options['minZoom'];
        }
        map.refresh();
    }
    /**
     * 设置背景图
     * @param imgSrc
     * @param width
     * @param height
     */
    map.setBackgroundImage = function (imgSrc, width, height) {
        fabric.Image.fromURL(imgSrc, function (oImg) {
            map.backCanvas.clear();
            map.backCanvas.add(oImg);
            map.backCanvas.renderAll();
        }, map.calcImgInfo(width, height, map.width, map.height))
    }
    /**
     * 增加固定点
     * @param positions
     */
    map.addFixedPosition = function (positions) {
        var mapPositions = [];
        for (var i = 0; i < positions.length; i++) {
            var position = map.makePosition(positions[i], 'F');
            mapPositions.push(position);
            map.showPosition(position, map.dynamicPositionCanvas);
        }
        map.fixedPositions = map.fixedPositions.concat(mapPositions);
        map.positions = map.positions.concat(mapPositions);
    }
    /**
     * 计算地图点的相关信息，包括相关内容赋值以及坐标转换
     * @param position
     * @returns {{moveAction: string, outAction: string, clickAction: string, extendId: string}}
     */
    map.calcPositionOption = function (position) {
        var option = {
            moveAction: undefined != position['moveAction'] ? position['moveAction'] : '',
            outAction: undefined != position['outAction'] ? position['outAction'] : '',
            clickAction: undefined != position['clickAction'] ? position['clickAction'] : '',
            extendId: undefined != position['extendId'] ? position['extendId'] : ''
        }
        var mapWidth = map.maxX - map.minX;
        var mapHeight = map.maxY - map.minY;

        if (mapWidth > 0 && mapHeight > 0 && "D" == position.positionType) {
            position['trueX'] = map.offsetX + ((position['x'] - map.minX) * (map.width - map.offsetX * 2) + 0.0) / mapWidth;
            position['trueY'] = map.offsetX + ((position['y'] - map.minY) * (map.width - map.offsetY * 2) + 0.0) / mapWidth;
        } else if ("F" != position.positionType) {
            position['trueX'] = position['x'];
            position['trueY'] = position['y'];
        }
        if ("circle" == position['type']) {
            option.left = Math.max(position['trueX'] - position['offsetX'], 0);
            option.top = Math.max(position['trueY'] - position['offsetY'], 0);
            option.strokeWidth = 0;
            option.radius = position['offsetX'];
            option.fill = position['color'];
        }
        if ('img' == position['type']) {
            option.top = Math.max(position['trueY'] - position['height'] / 2, 0);
            option.left = Math.max(position['trueX'] - position['width'] / 2, 0);
            option.width = position['width'];
            option.height = position['height'];
        }
        option.selectable = undefined != position['selectable'] ? position['selectable'] : false;
        option.positionType = undefined != position['positionType'] ? position['positionType'] : 'D';
        return option;
    };
    /**
     * 在指定的画布上显示一个具体的点，目前只支持圆点以及图片
     * @todo：支持更多的节点类型
     * @param position
     * @param canvas
     */
    map.showPosition = function (position, canvas) {
        if (position) {
            var option = map.calcPositionOption(position);
            if ("circle" == position['type']) {
                var shape = new fabric.Circle(option);
                canvas.add(shape);
            }
            if ('img' == position['type']) {
                map.loadImg++;
                fabric.Image.fromURL(position['src'], function (oImg) {
                    canvas.add(oImg);
                    map.loadImg--;
                }, option)
            }
        }
    };
    /**
     * 加载图片的等待事件
     */
    map.waitLoad = function () {
        if (map.loadImg <= 0) {
            clearTimeout(map.refreshTimeId);
            map.refreshTimeId = '';
            map.dynamicPositionCanvas.renderAll();
        }
    }
    /**
     * 清除动态节点
     */
    map.clearDynamicPositions = function () {
        for (var i = map.dynamicPositionCanvas.getObjects().length - 1; i >= 0; i--) {
            if ("D" == map.dynamicPositionCanvas.getObjects()[i].positionType) {
                map.positionsMap.remove(map.dynamicPositionCanvas.getObjects()[i].extendId);
                map.dynamicPositionCanvas.getObjects().splice(i, 1);
            }
        }
    };
    /**
     * 刷新map
     * @param positions
     */
    map.refresh = function (positions) {
        if (positions && positions instanceof Array && positions.length > 0) {
            var mapPositions = [];
            for (var i = 0; i < positions.length; i++) {
                mapPositions.push(map.makePosition(positions[i], 'D'))
            }
            map.dynamicPositions = mapPositions;
            map.positions = [];
            map.positions = map.positions.concat(map.fixedPositions);
            map.positions = map.positions.concat(map.dynamicPositions);
        }
        if (map.positions.length > 0) {
            map.clearDynamicPositions();
            for (var i = 0; i < map.dynamicPositions.length; i++) {
                map.showPosition(map.dynamicPositions[i], map.dynamicPositionCanvas);
            }
            map.refreshTimeId = setInterval("map.waitLoad()", 50);
        }
    }
    map.getNowCenterPoint = function () {
        return new fabric.Point((map.width - map.dynamicPositionCanvas.viewportTransform[4] ) / 2.0, (map.height - map.dynamicPositionCanvas.viewportTransform[5] ) / 2.0);

    };
    /**
     * 设置zoom值
     * @param zoomvalue
     */
    map.zoom = function (zoomvalue) {
        var nowCenterPoint = map.getNowCenterPoint();
        map.dynamicPositionCanvas.zoomToPoint(nowCenterPoint, zoomvalue)
        map.backCanvas.zoomToPoint(nowCenterPoint, zoomvalue);
        if (zoomvalue <= 1.05) {
            map.dynamicPositionCanvas.viewportTransform = [1, 0, 0, 1, 0, 0];
            map.backCanvas.viewportTransform = [1, 0, 0, 1, 0, 0];
        }
    }
    map.getZoom = function () {
        return map.backCanvas.getZoom();
    }
    /**
     * 缩小
     * @param zoomvalue
     */
    map.zoomIn = function () {
        var zoomValue = map.dynamicPositionCanvas.getZoom();
        if (zoomValue > map.minZoom * 1.0 + 0.001) {
            zoomValue = zoomValue * 1.0 - 0.2;
        }
        map.zoom(zoomValue);
    }
    /**
     * 放大
     * @param zoomvalue
     */
    map.zoomOut = function () {
        var zoomValue = map.dynamicPositionCanvas.getZoom();
        if (zoomValue < map.maxZoom * 1.0 - 0.001) {
            zoomValue = zoomValue * 1.0 + 0.2;
        }
        map.zoom(zoomValue);
    }
    /**
     *设置点是否可移动
     * @param id
     * @param selectAble
     */
    map.setPointSelectAble = function (id, selectAble) {
        if (map.positionsMap.contains(id)) {
            for (var i = 0; i < map.dynamicPositionCanvas.getObjects().length; i++) {
                if (id == map.dynamicPositionCanvas.getObjects()[i].extendId) {
                    map.dynamicPositionCanvas.getObjects()[i].selectable = selectAble;
                }
            }
        }
        map.dynamicPositionCanvas.renderAll();
    }
    /**
     * 根据定点坐标计算地图相对位置（minX,minY,maxX,maxY)
     * 至少需要有2个不同时在一条轴上的坐标，如果有多个坐标，则取距离最远的点以减少误差
     */
    map.calcRelativeRect = function () {
        if (map.fixedPositions.length > 0) {
            var rectMap = new HashMap();
            for (var i = 0; i < map.fixedPositions.length; i++) {
                var nowPosition = map.fixedPositions[i];
                if (null != nowPosition.x && null != nowPosition.y && null != nowPosition.trueX && null != nowPosition.trueY) {
                    if (!rectMap.contains("minX") || rectMap.get("minX").trueX > nowPosition.trueX) {
                        rectMap.set("minX", nowPosition);
                    }
                    if (!rectMap.contains("minY") || rectMap.get("minY").trueY > nowPosition.trueY) {
                        rectMap.set("minY", nowPosition);
                    }
                    if (!rectMap.contains("maxX") || rectMap.get("maxX").trueY < nowPosition.trueY) {
                        rectMap.set("maxX", nowPosition);
                    }
                    if (!rectMap.contains("maxY") || rectMap.get("maxY").trueY < nowPosition.trueY) {
                        rectMap.set("maxY", nowPosition);
                    }
                }
            }
            if (rectMap.get("maxX").trueX - rectMap.get("minX").trueX > 0 && rectMap.get("maxY").trueY - rectMap.get("minY").trueY > 0) {
                var xTrueDistance = rectMap.get("maxX").trueX - rectMap.get("minX").trueX;
                var xDistance = rectMap.get("maxX").x - rectMap.get("minX").x;
                var yTrueDistance = rectMap.get("maxY").trueY - rectMap.get("minY").trueY;
                var yDistance = rectMap.get("maxY").y - rectMap.get("minY").y;
                map.minX = rectMap.get("minX").x - rectMap.get("minX").trueX * xTrueDistance / xDistance;
                map.minY = rectMap.get("minY").y - rectMap.get("minY").trueY * yTrueDistance / yDistance;
                map.maxX = rectMap.get("maxX").x + (map.width * 1.0 - rectMap.get("maxX").trueX) * xTrueDistance / xDistance;
                map.maxY = rectMap.get("maxY").y + (map.height * 1.0 - rectMap.get("maxY").trueY) * yTrueDistance / yDistance;
            }
        }
    }
    /**
     * 刷新页面所有节点
     */
    map.renderAll = function () {
        map.dynamicPositionCanvas.clear();
        for (var i = 0; i < map.fixedPositions.length; i++) {
            map.showPosition(map.fixedPositions[i], map.dynamicPositionCanvas);
        }
        for (var i = 0; i < map.dynamicPositions.length; i++) {
            map.showPosition(map.dynamicPositions[i], map.dynamicPositionCanvas);
        }
        map.dynamicPositionCanvas.renderAll();
    }
    map.setCursor = function (cursor) {
        var elements = document.getElementsByClassName("upper-canvas");
        for (var i = 0; i < elements.length; i++) {
            elements[i].style.cursor = cursor;
        }
    }
    map.init(eleId, options);
    map.calcRelativeRect();
    map.refresh();
    return map;
}

