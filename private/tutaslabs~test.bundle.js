// Copyright 2015 (c) Famous Industries, Inc.
"use strict";
FamousFramework.includes("tutaslabs:test", "HEAD", ["tutaslabs/test/htemplate.js","tutaslabs/test/helpers.js"], function() {
    (function(){
        'use strict';
        function addGesture($famousNode, $GestureHandler, $payload, eventName) {
            new $GestureHandler($famousNode, [{
                    event: eventName,
                    callback: function (event) {
                        $payload.listener(event);
                    }
                }]);
        }
        FamousFramework.module('famous:events', 'HEAD', {
            'dependencies': {},
            'famousNodeConstructorName': '',
            'extensions': []
        }, {
            events: {
                '$public': {
                    'size-change': function ($famousNode, $payload) {
                        $famousNode.addComponent({
                            onSizeChange: function (sizeX, sizeY, sizeZ) {
                                $payload.listener({
                                    eventName: 'onSizeChange',
                                    value: [
                                        sizeX,
                                        sizeY,
                                        sizeZ
                                    ]
                                });
                            }
                        });
                    },
                    'parent-size-change': function ($famousNode, $payload) {
                        var parentFamousNode = $famousNode.getParent();
                        if (parentFamousNode) {
                            parentFamousNode.addComponent({
                                onSizeChange: function (sizeX, sizeY, sizeZ) {
                                    $payload.listener({
                                        eventName: 'onParentSizeChange',
                                        value: [
                                            sizeX,
                                            sizeY,
                                            sizeZ
                                        ]
                                    });
                                }
                            });
                        }
                    },
                    'drag': function ($famousNode, $GestureHandler, $payload) {
                        addGesture($famousNode, $GestureHandler, $payload, 'drag');
                    },
                    'tap': function ($famousNode, $GestureHandler, $payload) {
                        addGesture($famousNode, $GestureHandler, $payload, 'tap');
                    },
                    'rotate': function ($famousNode, $GestureHandler, $payload) {
                        addGesture($famousNode, $GestureHandler, $payload, 'rotate');
                    },
                    'pinch': function ($famousNode, $GestureHandler, $payload) {
                        addGesture($famousNode, $GestureHandler, $payload, 'pinch');
                    },
                    '$miss': function ($DOMElement, $famousNode, $payload) {
                        var eventName = $payload.eventName;
                        var listener = $payload.listener;
                        $famousNode.addUIEvent(eventName);
                        $DOMElement.on(eventName, function (event) {
                            listener(event);
                        });
                    }
                }
            }
        }).config({
            imports: { 'famous:events': [] },
            'extends': []
        });
    }());
    (function(){
        'use strict';
        var ddp;
        var dispatcher;
        var Watch = function (coll, dispatcher) {
            this.dispatch = dispatcher;
            this.coll = coll;
            ddp.watch(this.coll, function (chg, mess) {
                this.dispatch.emit(this.coll, {
                    'chg': chg,
                    'mess': mess
                });
            }.bind(this));
        };
        var MeteorDdp = function (wsUri, debug) {
            this.VERSIONS = ['pre1'];
            this.wsUri = wsUri;
            this.debug = debug;
            this.sock;
            this.defs = {};
            this.subs = {};
            this.watchers = {};
            this.collections = {};
            this.connected = false;
        };
        MeteorDdp.prototype._Ids = function () {
            var count = 0;
            return {
                next: function () {
                    return ++count + '';
                }
            };
        }();
        MeteorDdp.prototype.connect = function () {
            if (ddp && ddp.connected) {
                return;
            }
            var self = this;
            var conn = new $.Deferred();
            self.sock = new WebSocket(self.wsUri);
            self.sock.onopen = function () {
                self.send({
                    msg: 'connect',
                    version: self.VERSIONS[0],
                    support: self.VERSIONS
                });
            };
            self.sock.onerror = function (err) {
                conn.reject(err);
            };
            self.sock.onmessage = function (msg) {
                var data = JSON.parse(msg.data);
                switch (data.msg) {
                case 'connected':
                    conn.resolve(data);
                    this.connected = true;
                    break;
                case 'result':
                    self._resolveCall(data);
                    break;
                case 'updated':
                    break;
                case 'changed':
                    self._changeDoc(data);
                    break;
                case 'added':
                    self._addDoc(data);
                    break;
                case 'removed':
                    self._removeDoc(data);
                    break;
                case 'ready':
                    self._resolveSubs(data);
                    break;
                case 'nosub':
                    self._resolveNoSub(data);
                    break;
                case 'addedBefore':
                    self._addDoc(data);
                    break;
                case 'movedBefore':
                    break;
                }
            };
            return conn.promise();
        };
        MeteorDdp.prototype._resolveNoSub = function (data) {
            if (data.error) {
                var error = data.error;
                this.defs[data.id].reject(error.reason || 'Subscription not found');
            } else {
                this.defs[data.id].resolve();
            }
        };
        MeteorDdp.prototype._resolveCall = function (data) {
            if (data.error) {
                this.defs[data.id].reject(data.error.reason);
            } else if (typeof data.result !== 'undefined') {
                this.defs[data.id].resolve(data.result);
            }
        };
        MeteorDdp.prototype._resolveSubs = function (data) {
            var subIds = data.subs;
            for (var i = 0; i < subIds.length; i++) {
                this.defs[subIds[i]].resolve();
            }
        };
        MeteorDdp.prototype._changeDoc = function (msg) {
            var collName = msg.collection;
            var id = msg.id;
            var fields = msg.fields;
            var cleared = msg.cleared;
            var coll = this.collections[collName];
            if (fields) {
                for (var k in fields) {
                    coll[id][k] = fields[k];
                }
            } else if (cleared) {
                for (var i = 0; i < cleared.length; i++) {
                    var fieldName = cleared[i];
                    delete coll[id][fieldName];
                }
            }
            var changedDoc = coll[id];
            this._notifyWatchers(collName, changedDoc, id, msg.msg);
        };
        MeteorDdp.prototype._addDoc = function (msg) {
            var collName = msg.collection;
            var id = msg.id;
            if (!this.collections[collName]) {
                this.collections[collName] = {};
            }
            this.collections[collName][id] = msg.fields;
            var changedDoc = this.collections[collName][id];
            this._notifyWatchers(collName, changedDoc, id, msg.msg);
        };
        MeteorDdp.prototype._removeDoc = function (msg) {
            var collName = msg.collection;
            var id = msg.id;
            var doc = this.collections[collName][id];
            var docCopy = JSON.parse(JSON.stringify(doc));
            delete this.collections[collName][id];
            this._notifyWatchers(collName, docCopy, id, msg.msg);
        };
        MeteorDdp.prototype._notifyWatchers = function (collName, changedDoc, docId, message) {
            changedDoc = JSON.parse(JSON.stringify(changedDoc));
            changedDoc._id = docId;
            if (!this.watchers[collName]) {
                this.watchers[collName] = [];
            } else {
                for (var i = 0; i < this.watchers[collName].length; i++) {
                    this.watchers[collName][i](changedDoc, message);
                }
            }
        };
        MeteorDdp.prototype._deferredSend = function (actionType, name, params) {
            var id = this._Ids.next();
            this.defs[id] = new $.Deferred();
            var args = params || [];
            var o = {
                msg: actionType,
                params: args,
                id: id
            };
            if (actionType === 'method') {
                o.method = name;
            } else if (actionType === 'sub') {
                o.name = name;
                this.subs[name] = id;
            }
            this.send(o);
            return this.defs[id].promise();
        };
        MeteorDdp.prototype.call = function (methodName, params) {
            return this._deferredSend('method', methodName, params);
        };
        MeteorDdp.prototype.subscribe = function (pubName, params) {
            return this._deferredSend('sub', pubName, params);
        };
        MeteorDdp.prototype.unsubscribe = function (pubName) {
            this.defs[id] = new $.Deferred();
            if (!this.subs[pubName]) {
                this.defs[id].reject(pubName + ' was never subscribed');
            } else {
                var id = this.subs[pubName];
                var o = {
                    msg: 'unsub',
                    id: id
                };
                this.send(o);
            }
            return this.defs[id].promise();
        };
        MeteorDdp.prototype.watch = function (collectionName, cb) {
            if (!this.watchers[collectionName]) {
                this.watchers[collectionName] = [];
            }
            this.watchers[collectionName].push(cb);
        };
        MeteorDdp.prototype.getCollection = function (collectionName) {
            return this.collections[collectionName] || null;
        };
        MeteorDdp.prototype.getDocument = function (collectionName, docId) {
            return this.collections[collectionName][docId] || null;
        };
        MeteorDdp.prototype.send = function (msg) {
            this.sock.send(JSON.stringify(msg));
        };
        MeteorDdp.prototype.close = function () {
            this.sock.close();
        };
        FamousFramework.scene('tutaslabs:meteor-ddp', 'HEAD', {
            'dependencies': { 'famous:core:node': 'HEAD' },
            'famousNodeConstructorName': '',
            'extensions': [{
                    'name': 'famous:core:node',
                    'version': 'HEAD'
                }]
        }, {
            events: {
                '$public': {
                    'connect': function ($payload, $state, $dispatcher) {
                        dispatcher = $dispatcher;
                        if ($payload === '') {
                            return;
                        }
                        if (!ddp || !ddp.connected) {
                            try {
                                ddp = new MeteorDdp($payload.uri, $payload.debug);
                                ddp.connect().done(function () {
                                    ddp.connected = true;
                                    if ($payload.debug)
                                        console.log('connected');
                                    var watches = $payload.watch;
                                    for (var i = 0; i < watches.length; i++) {
                                        ddp.subscribe(watches[i]).fail(function (err) {
                                            console.log(watches[i] + ' sub failed', err);
                                        }.bind(this));
                                        new Watch(watches[i], $dispatcher);
                                    }
                                });
                            } catch (ee) {
                                console.warn('error', ee);
                                $dispatcher.emit('error', ee);
                            }
                        }
                    },
                    'call': function ($payload, $state, $dispatcher) {
                        if (ddp && ddp.connected) {
                            if ($payload === '') {
                                return;
                            }
                            ddp.call($payload.method, [$payload.payload]).done(function (res) {
                                dispatcher.emit($payload.resultTo, res);
                            });
                        }
                    },
                    'getcol': function ($payload, $state, $dispatcher) {
                        if (ddp && ddp.connected) {
                            if ($payload === '') {
                                return;
                            }
                            var col = ddp.getCollection($payload.col);
                            $dispatcher.emit($payload.res, col);
                        }
                    }
                }
            }
        });
    }());
    (function(){
        'use strict';
        FamousFramework.scene('tutaslabs:ui:popup', 'HEAD', {
            'dependencies': {
                'famous:events': 'HEAD',
                'famous:core:node': 'HEAD'
            },
            'famousNodeConstructorName': '',
            'extensions': [{
                    'name': 'famous:core:node',
                    'version': 'HEAD'
                }]
        }, {
            behaviors: {
                '#popup': {
                    'align': [
                        0.5,
                        0.3
                    ],
                    'origin': [
                        0.5,
                        0.5
                    ],
                    'mount-point': [
                        0.5,
                        0.5
                    ],
                    'size': function (size) {
                        return size;
                    },
                    'position-z': 10,
                    'style': function (popit, color) {
                        return {
                            'background-color': color,
                            'padding-top': '10px',
                            'border-radius': '20px',
                            'text-align': 'center',
                            'border': '2px black solid',
                            'display': popit
                        };
                    },
                    'unselectable': false,
                    'content': function (content) {
                        return content;
                    }
                },
                '.button': {
                    'align': [
                        0.5,
                        0.4
                    ],
                    'origin': [
                        0.5,
                        0.5
                    ],
                    'mount-point': [
                        0.5,
                        0.5
                    ],
                    'size': [
                        100,
                        30
                    ],
                    'position-z': 20,
                    'style': function (displayBTNS) {
                        return {
                            'background-color': 'lightblue',
                            'border-radius': '15px',
                            'cursor': 'pointer',
                            'text-align': 'center',
                            'line-height': '30px',
                            'display': displayBTNS
                        };
                    },
                    'content': 'Ok'
                },
                '.button2': {
                    'align': [
                        0.5,
                        0.7
                    ],
                    'origin': [
                        0.5,
                        0.5
                    ],
                    'mount-point': [
                        0.5,
                        0.5
                    ],
                    'size': [
                        100,
                        30
                    ],
                    'position-z': 20,
                    'style': function () {
                        return {
                            'background-color': 'lightblue',
                            'border-radius': '15px',
                            'cursor': 'pointer',
                            'text-align': 'center',
                            'line-height': '30px'
                        };
                    },
                    'content': function (buttonText) {
                        return buttonText;
                    }
                }
            },
            events: {
                '$public': {
                    'content': function ($state, $payload) {
                        $state.set('content', $payload);
                    },
                    'popit': function ($state, $payload) {
                        $state.set('popit', $payload);
                    },
                    'size': function ($state, $payload) {
                        $state.set('size', $payload);
                    },
                    'buttons': function ($state, $payload) {
                        $state.set('displayBTNS', $payload);
                    },
                    'color': function ($state, $payload) {
                        $state.set('color', $payload);
                    },
                    'buttonText': function ($state, $payload) {
                        $state.set('buttonText', $payload);
                    }
                },
                '.button': {
                    'famous:events:click': function ($event, $state, $dispatcher) {
                        $event.stopPropagation();
                        $state.set('popit', 'none');
                        $dispatcher.emit('clicked', 'OK');
                    }
                },
                '.button2': {
                    'famous:events:click': function ($event, $state, $dispatcher) {
                        $event.stopPropagation();
                        $state.set('popit', 'none');
                        $dispatcher.emit('clicked', 'CANCEL');
                    }
                },
                '#popup': {
                    'famous:events:click': function ($event, $state, $dispatcher) {
                        $event.stopPropagation();
                        $state.set('popit', 'none');
                        $dispatcher.emit('clicked', 'CANCEL');
                    }
                }
            },
            states: {
                popit: 'none',
                content: 'Delete',
                size: [
                    150,
                    150
                ],
                displayBTNS: 'block',
                color: 'red',
                buttonText: 'Cancel'
            },
            tree: '<famous:core:node id="popup">\n    <famous:core:node class="button"></famous:core:node>\n    <famous:core:node class="button2"></famous:core:node>\n</famous:core:node>'
        });
    }());
    (function(){
        'use strict';
        FamousFramework.module('famous:core:node', 'HEAD', {
            'dependencies': {},
            'famousNodeConstructorName': '',
            'extensions': []
        }, {
            behaviors: { '$self': { '$yield': true } },
            events: {
                '$public': {
                    'add-class': function ($DOMElement, $payload) {
                        $DOMElement.addClass($payload);
                    },
                    'align': function ($famousNode, $payload) {
                        $famousNode.setAlign($payload[0], $payload[1], $payload[2]);
                    },
                    'align-x': function ($famousNode, $payload) {
                        $famousNode.setAlign($payload, null, null);
                    },
                    'align-y': function ($famousNode, $payload) {
                        $famousNode.setAlign(null, $payload, null);
                    },
                    'align-z': function ($famousNode, $payload) {
                        $famousNode.setAlign(null, null, $payload);
                    },
                    'attach': function ($payload, $famousNode) {
                        $payload($famousNode);
                    },
                    'attributes': function ($DOMElement, $payload) {
                        for (var attributeName in $payload) {
                            $DOMElement.setAttribute(attributeName, $payload[attributeName]);
                        }
                    },
                    'backface-visible': function ($state, $payload, $dispatcher) {
                        var style = $state.get('style') || {};
                        style['-webkit-backface-visibility'] = $payload ? 'visible' : 'hidden';
                        style['backface-visibility'] = $payload ? 'visible' : 'hidden';
                        $dispatcher.trigger('style', style);
                    },
                    'base-color': function ($mesh, $payload, $state) {
                        $mesh.setBaseColor(new FamousFramework.FamousEngine.utilities.Color($payload));
                        if (!$state.get('hasGeometry')) {
                            $mesh.setGeometry(new FamousFramework.FamousEngine.webglGeometries.Plane());
                            $state.set('hasGeometry', true);
                        }
                    },
                    'box-shadow': function ($state, $payload, $dispatcher) {
                        var style = $state.get('style') || {};
                        style['-webkit-box-shadow'] = $payload;
                        style['-moz-box-shadow'] = $payload;
                        style['box-shadow'] = $payload;
                        $dispatcher.trigger('style', style);
                    },
                    'camera': function ($camera, $payload) {
                        $camera.set($payload[0], $payload[1]);
                    },
                    'content': function ($DOMElement, $payload) {
                        $DOMElement.setContent($payload);
                    },
                    'flat-shading': function ($mesh, $payload) {
                        $mesh.setFlatShading($payload);
                    },
                    'geometry': function ($mesh, $payload, $state) {
                        $mesh.setGeometry(new FamousFramework.FamousEngine.webglGeometries[$payload.shape]($payload.options));
                        $state.set('hasGeometry', true);
                    },
                    'glossiness': function ($mesh, $payload) {
                        $mesh.setGlossiness($payload.glossiness, $payload.strength);
                    },
                    'id': function ($DOMElement, $payload) {
                        $DOMElement.setId($payload);
                    },
                    'light': function ($famousNode, $payload) {
                        var webglRenderables = FamousFramework.FamousEngine.webglRenderables;
                        var Color = FamousFramework.FamousEngine.utilities.Color;
                        if ($payload.type === 'point') {
                            new webglRenderables.PointLight($famousNode).setColor(new Color($payload.color));
                        } else {
                            new webglRenderables.AmbientLight($famousNode).setColor(new Color($payload.color));
                        }
                    },
                    'mount-point': function ($famousNode, $payload) {
                        $famousNode.setMountPoint($payload[0], $payload[1], $payload[2]);
                    },
                    'mount-point-x': function ($famousNode, $payload) {
                        $famousNode.setMountPoint($payload, null, null);
                    },
                    'mount-point-y': function ($famousNode, $payload) {
                        $famousNode.setMountPoint(null, $payload, null);
                    },
                    'mount-point-z': function ($famousNode, $payload) {
                        $famousNode.setMountPoint(null, null, $payload);
                    },
                    'normals': function ($mesh, $payload) {
                        $mesh.setNormals($payload);
                    },
                    'offset-position': function ($famousNode, $payload) {
                        var currentPos = $famousNode.getPosition();
                        $famousNode.setPosition(currentPos[0] + $payload[0] || 0, currentPos[1] + $payload[1] || 0, currentPos[2] + $payload[2] || 0);
                    },
                    'opacity': function ($famousNode, $payload) {
                        $famousNode.setOpacity($payload);
                    },
                    'origin': function ($famousNode, $payload) {
                        $famousNode.setOrigin($payload[0], $payload[1], $payload[2]);
                    },
                    'origin-x': function ($famousNode, $payload) {
                        $famousNode.setOrigin($payload, null, null);
                    },
                    'origin-y': function ($famousNode, $payload) {
                        $famousNode.setOrigin(null, $payload, null);
                    },
                    'origin-z': function ($famousNode, $payload) {
                        $famousNode.setOrigin(null, null, $payload);
                    },
                    'position': function ($famousNode, $payload) {
                        $famousNode.setPosition($payload[0], $payload[1], $payload[2]);
                    },
                    'position-offsets': function ($mesh, $payload) {
                        $mesh.setPositonOffsets($payload);
                    },
                    'position-x': function ($famousNode, $payload) {
                        $famousNode.setPosition($payload, null, null);
                    },
                    'position-y': function ($famousNode, $payload) {
                        $famousNode.setPosition(null, $payload, null);
                    },
                    'position-z': function ($famousNode, $payload) {
                        $famousNode.setPosition(null, null, $payload);
                    },
                    'remove-class': function ($DOMElement, $payload) {
                        $DOMElement.removeClass($payload);
                    },
                    'rotation': function ($famousNode, $payload) {
                        $famousNode.setRotation($payload[0], $payload[1], $payload[2], $payload[3]);
                    },
                    'rotation-x': function ($famousNode, $payload) {
                        $famousNode.setRotation($payload, null, null);
                    },
                    'rotation-y': function ($famousNode, $payload) {
                        $famousNode.setRotation(null, $payload, null);
                    },
                    'rotation-z': function ($famousNode, $payload) {
                        $famousNode.setRotation(null, null, $payload);
                    },
                    'scale': function ($famousNode, $payload) {
                        $famousNode.setScale($payload[0], $payload[1], $payload[2]);
                    },
                    'scale-x': function ($famousNode, $payload) {
                        $famousNode.setScale($payload, null, null);
                    },
                    'scale-y': function ($famousNode, $payload) {
                        $famousNode.setScale(null, $payload, null);
                    },
                    'scale-z': function ($famousNode, $payload) {
                        $famousNode.setScale(null, null, $payload);
                    },
                    'size': function ($payload, $dispatcher) {
                        var xSize = $payload[0];
                        var ySize = $payload[1];
                        var zSize = $payload[2];
                        if (xSize === true)
                            $dispatcher.trigger('size-true-x');
                        else if (xSize !== undefined)
                            $dispatcher.trigger('size-absolute-x', xSize);
                        if (ySize === true)
                            $dispatcher.trigger('size-true-y');
                        else if (ySize !== undefined)
                            $dispatcher.trigger('size-absolute-y', ySize);
                        if (zSize === true)
                            $dispatcher.trigger('size-true-z');
                        else if (zSize !== undefined)
                            $dispatcher.trigger('size-absolute-z', zSize);
                    },
                    'size-true': function ($famousNode) {
                        $famousNode.setSizeMode(2, 2, 2);
                    },
                    'size-true-x': function ($famousNode) {
                        $famousNode.setSizeMode(2, null, null);
                    },
                    'size-true-y': function ($famousNode) {
                        $famousNode.setSizeMode(null, 2, null);
                    },
                    'size-true-z': function ($famousNode) {
                        $famousNode.setSizeMode(null, null, 2);
                    },
                    'size-absolute': function ($famousNode, $payload) {
                        $famousNode.setSizeMode(1, 1, 1);
                        $famousNode.setAbsoluteSize($payload[0], $payload[1], $payload[2]);
                    },
                    'size-absolute-x': function ($famousNode, $payload) {
                        $famousNode.setSizeMode(1, null, null);
                        $famousNode.setAbsoluteSize($payload, null, null);
                    },
                    'size-absolute-y': function ($famousNode, $payload) {
                        $famousNode.setSizeMode(null, 1, null);
                        $famousNode.setAbsoluteSize(null, $payload, null);
                    },
                    'size-absolute-z': function ($famousNode, $payload) {
                        $famousNode.setSizeMode(null, null, 1);
                        $famousNode.setAbsoluteSize(null, null, $payload);
                    },
                    'size-differential': function ($famousNode, $payload) {
                        $famousNode.setSizeMode(0, 0, 0);
                        $famousNode.setDifferentialSize($payload[0], $payload[1], $payload[2]);
                    },
                    'size-differential-x': function ($famousNode, $payload) {
                        $famousNode.setSizeMode(0, null, null);
                        $famousNode.setDifferentialSize($payload, null, null);
                    },
                    'size-differential-y': function ($famousNode, $payload) {
                        $famousNode.setSizeMode(null, 0, null);
                        $famousNode.setDifferentialSize(null, $payload, null);
                    },
                    'size-differential-z': function ($famousNode, $payload) {
                        $famousNode.setSizeMode(null, null, 0);
                        $famousNode.setDifferentialSize(null, null, $payload);
                    },
                    'size-proportional': function ($famousNode, $payload) {
                        $famousNode.setSizeMode(0, 0, 0);
                        $famousNode.setProportionalSize($payload[0], $payload[1], $payload[2]);
                    },
                    'size-proportional-x': function ($famousNode, $payload) {
                        $famousNode.setSizeMode(0, null, null);
                        $famousNode.setProportionalSize($payload, null, null);
                    },
                    'size-proportional-y': function ($famousNode, $payload) {
                        $famousNode.setSizeMode(null, 0, null);
                        $famousNode.setProportionalSize(null, $payload, null);
                    },
                    'size-proportional-z': function ($famousNode, $payload) {
                        $famousNode.setSizeMode(null, null, 0);
                        $famousNode.setProportionalSize(null, null, $payload);
                    },
                    'style': function ($DOMElement, $payload) {
                        for (var styleName in $payload) {
                            $DOMElement.setProperty(styleName, $payload[styleName]);
                        }
                    },
                    'unselectable': function ($state, $payload, $dispatcher) {
                        if ($payload) {
                            var style = $state.get('style') || {};
                            style['-moz-user-select'] = '-moz-none';
                            style['-khtml-user-select'] = 'none';
                            style['-webkit-user-select'] = 'none';
                            style['-o-user-select'] = 'none';
                            style['user-select'] = 'none';
                            $dispatcher.trigger('style', style);
                        }
                    }
                }
            },
            states: {
                'didTemplate': false,
                'initialContent': '',
                'hasGeometry': false
            }
        }).config({
            'extends': [],
            imports: {}
        });
    }());
    (function(){
        'use strict';
        FamousFramework.scene('tutaslabs:layouts:scroll-view', 'HEAD', {
            'dependencies': { 'famous:core:node': 'HEAD' },
            'famousNodeConstructorName': '',
            'extensions': [{
                    'name': 'famous:core:node',
                    'version': 'HEAD'
                }]
        }, {
            behaviors: {
                '#sv': {
                    align: function (align) {
                        return align;
                    },
                    origin: function (origin) {
                        return origin;
                    },
                    size: function (size) {
                        return size;
                    },
                    style: function (border) {
                        var style = {};
                        style.overflow = 'scroll';
                        if (border)
                            style.border = border;
                        return style;
                    }
                },
                '.item': {
                    '$yield': '.scroll-view-item',
                    'size': function (iheight) {
                        return [
                            undefined,
                            iheight
                        ];
                    }
                }
            },
            events: {
                '$public': {
                    'iheight': function ($state, $payload) {
                        $state.set('iheight', $payload);
                    },
                    'position': function ($state, $payload) {
                        $state.set('position', $payload);
                    },
                    'size': function ($state, $payload) {
                        $state.set('size', $payload);
                    },
                    'align': function ($state, $payload) {
                        $state.set('align', $payload);
                    }
                }
            },
            states: {
                iheight: 50,
                size: [
                    400,
                    400
                ],
                position: [
                    100,
                    100
                ],
                border: '2px solid black',
                align: [
                    0,
                    0
                ],
                origin: [
                    0,
                    0
                ]
            },
            tree: '<famous:core:node id="sv">\n\n        <famous:core:node class="item"></famous:core:node>\n</famous:core:node>\n\n    '
        });
    }());
    (function(){
        FamousFramework.attach('tutaslabs:test', 'HEAD', '#htemplate', function (node) {
            var source = '<div>This line is an example of <b>handlebars</b> rendered template {{title}} cost is {{cost}}\n                    <br>The list items are also templated to allow displaying more complex content\n                    <br>Click on list item to see a <b>delete</b> popup.</div>';
            var temp = Handlebars.compile(source);
            var context = {
                title: 'test',
                cost: 25
            };
            var html = temp(context);
            renderTemplate(node, html);
        });
        var getElementFromDOMElement = function (node, callback) {
            var clock = FamousFramework.FamousEngine.core.FamousEngine.getClock();
            var query = function () {
                var nodeId = node.getLocation();
                var elements = document.querySelector(nodeId.split('/')[0]).querySelectorAll('[data-fa-path]');
                for (var i = 0; i < elements.length; ++i) {
                    if (elements[i].dataset.faPath === nodeId) {
                        return callback(elements[i]);
                    }
                }
                clock.setTimeout(query, 16);
            };
            clock.setTimeout(query, 64);
        };
        var renderTemplate = function (node, content) {
            var self = this;
            var scontent = content;
            getElementFromDOMElement(node, function (el) {
                var contentdiv = el.childNodes[0];
                contentdiv.innerHTML = scontent;
            }.bind(self));
        };
        'use strict';
        var items = [];
        var clickedItem = -1;
        var clickedIndex = -1;
        var _state;
        var question = {
            one: {
                align: [
                    0.06,
                    0.03
                ],
                content: '<h3>Reset DB</h3>This button will reset the Database to three pre-defined entries.\n    This is accomplished by calling a Meteor Method on the server.\n    The counter collection is updated to reflect 3 entries.\n   '
            },
            two: {
                align: [
                    0.38,
                    0.03
                ],
                content: '<h3>Add a line item</h3>\n        Calls a Meteor Method to add an entry to the Chat collection. Increments the counter collection to reflect the\n        adding of one item.\n    '
            },
            three: {
                align: [
                    0.67,
                    0.03
                ],
                content: '<h3>Get Chat Collection</h3>\n        This will issue a DDP get collection on the Chat collection. The collection will be returned from\n        the local collection database on the client if it is current, otherwise it will be retrieved from the server.\n        The Meteor Method Call results window is used to display the text of the first record in the collection to show that it works.\n    '
            },
            four: {
                align: [
                    0.3,
                    0.78
                ],
                content: '<h3>Collection Counter Monitor</h3>\n        This displays the watch results from the counter collection. Any changes to the collection will trigger a reactive\n        update of this content.\n    '
            },
            five: {
                align: [
                    0.1,
                    0.88
                ],
                content: '<h3>Collection Chat Monitor</h3>\n        This text field displays the results of watching the Chat collection in real time. It will display the Chat ID,\n            text, and DDP message type. The message types we are interested in are added,removed and changed. The response\n        from the server will contain the NEW values of the Chat record that was added or modified.\n            <br><br>We do not use this data in the application. To update the Chat listings we issue a get collection whenever\n                we see this collection change. Since our collection is small there is no performance impact.\n    '
            }
        };
        var bclicked = function (event) {
            event.stopPropagation();
            _state.set('call', {
                resultTo: 'test3',
                method: 'removeChat',
                payload: event.srcElement.name
            });
            _state.set('call', '');
        };
        var setClickEvents = function () {
            setTimeout(function () {
                var b = document.getElementsByClassName('but');
                for (var i = 0; i < b.length; i++) {
                    b[i].addEventListener('click', bclicked);
                }
            }, 500);
        };
        var qclicked = function (event) {
            event.stopPropagation();
            var n = this.attributes.name.value;
            _state.set('infoContent', question[n].content);
            _state.set('displayInfo', 'block');
        };
        var setQClickEvents = function () {
            setTimeout(function () {
                var b = document.getElementsByClassName('question');
                for (var i = 0; i < b.length; i++) {
                    b[i].addEventListener('click', qclicked);
                }
            }, 500);
        };
        var listeners = function ($dispatcher, $state) {
            $dispatcher.on('test', function (event) {
                $state.set('results', 'Add result: ' + event.detail);
                setClickEvents();
            });
            $dispatcher.on('test2', function (event) {
                $state.set('results', 'Reset result: ' + event.detail);
                setClickEvents();
            });
            $dispatcher.on('test3', function (event) {
                $state.set('results', 'Getlist :' + event.detail[0].text);
            });
        };
        FamousFramework.scene('tutaslabs:test', 'HEAD', {
            'dependencies': {
                'famous:events': 'HEAD',
                'tutaslabs:meteor-ddp': 'HEAD',
                'tutaslabs:ui:popup': 'HEAD',
                'famous:core:node': 'HEAD',
                'tutaslabs:layouts:scroll-view': 'HEAD'
            },
            'famousNodeConstructorName': '',
            'extensions': [{
                    'name': 'famous:core:node',
                    'version': 'HEAD'
                }]
        }, {
            behaviors: {
                '$self': { style: { 'background-color': 'lightblue' } },
                '#pop1': {
                    'content': 'Delete Item?',
                    'buttons': 'block',
                    'popit': function (displayPOP) {
                        return displayPOP;
                    }
                },
                '#pop2': {
                    'content': function (infoContent) {
                        return infoContent;
                    },
                    'size': [
                        400,
                        400
                    ],
                    'buttons': 'none',
                    'color': 'azure',
                    'buttonText': 'Close',
                    'popit': function (displayInfo) {
                        return displayInfo;
                    }
                },
                '#htemplate': {
                    size: [
                        undefined,
                        50
                    ],
                    'align': [
                        0.2,
                        0.1
                    ],
                    'origin': [
                        0.5,
                        0.5
                    ],
                    content: ' '
                },
                '#notice': {
                    size: [
                        200,
                        50
                    ],
                    'align': [
                        0.38,
                        0.65
                    ],
                    'origin': [
                        0.5,
                        0.5
                    ],
                    content: 'Meteor Method Call Results '
                },
                'tutaslabs:meteor-ddp': {
                    'connect': function (connect) {
                        return connect;
                    },
                    'call': function (call) {
                        return call;
                    },
                    'getcol': function (getcol) {
                        return getcol;
                    }
                },
                '#text': {
                    'align': [
                        0.5,
                        0.8
                    ],
                    'origin': [
                        0.5,
                        0.5
                    ],
                    'mount-point': [
                        0.5,
                        0.5
                    ],
                    'size': [
                        200,
                        50
                    ],
                    'style': {
                        'background-color': 'red',
                        'text-align': 'center',
                        'line-height': '50px',
                        'pointer': 'none',
                        'border-radius': '5px'
                    },
                    'content': function (counter) {
                        return 'Number of items is: ' + counter;
                    },
                    'unselectable': true
                },
                '#response': {
                    'align': [
                        0.5,
                        0.9
                    ],
                    'origin': [
                        0.5,
                        0.5
                    ],
                    'mount-point': [
                        0.5,
                        0.5
                    ],
                    'size': [
                        500,
                        50
                    ],
                    'style': {
                        'background-color': 'lightgreen',
                        'text-align': 'center',
                        'line-height': '50px',
                        'border-radius': '5px'
                    },
                    'content': function (chat) {
                        return chat;
                    },
                    'unselectable': true
                },
                '#button': {
                    'align': [
                        0.5,
                        0
                    ],
                    'origin': [
                        0.5,
                        0
                    ],
                    'mount-point': [
                        0.5,
                        0
                    ],
                    'size': [
                        100,
                        50
                    ],
                    'style': {
                        'background-color': 'yellow',
                        'text-align': 'center',
                        'line-height': '50px',
                        'cursor': 'pointer',
                        'border-radius': '20px'
                    },
                    'content': 'Add',
                    'unselectable': true
                },
                '#getcol': {
                    'align': [
                        0.8,
                        0
                    ],
                    'origin': [
                        0.5,
                        0
                    ],
                    'mount-point': [
                        0.5,
                        0
                    ],
                    'size': [
                        100,
                        50
                    ],
                    'style': {
                        'background-color': 'yellow',
                        'text-align': 'center',
                        'line-height': '50px',
                        'cursor': 'pointer',
                        'border-radius': '20px'
                    },
                    'content': 'GetCol',
                    'unselectable': true
                },
                '#results': {
                    'align': [
                        0.5,
                        0.68
                    ],
                    'origin': [
                        0.5,
                        0
                    ],
                    'mount-point': [
                        0.5,
                        0
                    ],
                    'size': [
                        300,
                        50
                    ],
                    'style': {
                        'background-color': 'lightyellow',
                        'text-align': 'center',
                        'line-height': '50px',
                        'overflow': 'hidden'
                    },
                    'content': function (results) {
                        return results;
                    },
                    'unselectable': true
                },
                '#reset': {
                    'align': [
                        0.2,
                        0
                    ],
                    'origin': [
                        0.5,
                        0
                    ],
                    'mount-point': [
                        0.5,
                        0
                    ],
                    'size': [
                        100,
                        50
                    ],
                    'style': {
                        'background-color': 'yellow',
                        'text-align': 'center',
                        'line-height': '50px',
                        'cursor': 'pointer',
                        'border-radius': '20px'
                    },
                    'content': 'Reset DB',
                    'unselectable': true
                },
                'tutaslabs:layouts:scroll-view': {
                    'iheight': 50,
                    'size': [
                        500,
                        300
                    ],
                    'align': [
                        0.2,
                        0.2
                    ]
                },
                '.scroll-view-item': {
                    style: function ($index, clicked) {
                        var bc = 'white';
                        if ($index === clickedIndex) {
                            bc = 'lightblue';
                        }
                        return {
                            'background-color': bc,
                            'border': '1px solid black',
                            'color': '#40b2e8',
                            'font-family': 'Lato',
                            'font-size': '30px',
                            'padding': '10px'
                        };
                    },
                    'unselectable': true,
                    'position': function ($index, iheight) {
                        return [
                            0,
                            $index * iheight
                        ];
                    },
                    '$repeat': function (colres, itemTemp, clicked) {
                        var mess = [];
                        var x = 0;
                        for (var i in colres) {
                            items[x] = i;
                            x++;
                            var temp = Handlebars.compile(itemTemp);
                            var context = {
                                title: colres[i].text,
                                index: x,
                                key: i,
                                cost: 25
                            };
                            var html = temp(context);
                            mess.push({ content: html });
                        }
                        return mess;
                    }
                },
                '.question': {
                    size: [
                        20,
                        20
                    ],
                    content: '?',
                    origin: [
                        0.5,
                        0.5
                    ],
                    'position-z': 10,
                    style: {
                        'border-radius': '10px',
                        'color': 'white',
                        'background-color': 'blue',
                        'text-align': 'center',
                        'cursor': 'pointer',
                        'border': '1px black solid'
                    },
                    '$repeat': function () {
                        var mess = [];
                        for (var i in question) {
                            mess.push({
                                align: question[i].align,
                                attributes: { name: i }
                            });
                        }
                        return mess;
                    }
                }
            },
            events: {
                '#pop1': {
                    'clicked': function ($payload, $event, $state) {
                        $state.set('displayPOP', 'none');
                        clickedIndex = -1;
                        $state.set('clicked', !$state.get('clicked'));
                        if ($payload === 'OK') {
                            $state.set('call', {
                                resultTo: 'test3',
                                method: 'removeChat',
                                payload: clickedItem
                            });
                            $state.set('call', '');
                        }
                    }
                },
                '#pop2': {
                    'clicked': function ($payload, $event, $state) {
                        $state.set('displayInfo', 'none');
                    }
                },
                '$lifecycle': {
                    'post-load': function ($state, $dispatcher) {
                        _state = $state;
                        var c = $state.get('connect');
                        listeners($dispatcher, $state);
                        if (c === '') {
                            var host = window.location.host;
                            if (host.indexOf('ocalhost') > 0) {
                                host = 'localhost:3000';
                            }
                            $state.set('connect', {
                                debug: true,
                                uri: 'ws://' + host + '/websocket',
                                watch: [
                                    'counter',
                                    'chat'
                                ]
                            });
                        }
                        setClickEvents();
                        setQClickEvents();
                    }
                },
                'tutaslabs:meteor-ddp': {
                    'chat': function ($payload, $event, $state) {
                        $state.set('chat', 'ID: ' + $payload.chg._id + ' Text: ' + $payload.chg.text + ' Msg: ' + $payload.mess);
                        if ($payload.mess === 'removed' || $payload.mess === 'changed' || $payload.mess === 'added') {
                            $state.set('getcol', {
                                col: 'chat',
                                res: 'getChat'
                            });
                            $state.set('getcol', '');
                            setClickEvents();
                        }
                    },
                    'counter': function ($payload, $event, $state) {
                        $state.set('counter', $payload.chg.count);
                    },
                    'getChat': function ($payload, $event, $state) {
                        $state.set('colres', $payload);
                        setClickEvents();
                    },
                    'error': function ($payload, $dispatcher) {
                        console.warn('error ', $payload);
                    }
                },
                '.scroll-view-item': {
                    'famous:events:click': function ($index, $event, $state) {
                        clickedItem = items[$index];
                        clickedIndex = $index;
                        $state.set('displayPOP', 'block');
                        $state.set('clicked', !$state.get('clicked'));
                    }
                },
                '#reset': {
                    'famous:events:click': function ($event, $state) {
                        $event.stopPropagation();
                        $state.set('call', {
                            resultTo: 'test2',
                            method: 'reset',
                            payload: []
                        });
                        $state.set('call', '');
                    }
                },
                '#button': {
                    'famous:events:click': function ($event, $state) {
                        $event.stopPropagation();
                        $state.set('call', {
                            resultTo: 'test',
                            method: 'addChat',
                            payload: {
                                text: 'I was added',
                                descr: 'this is a test'
                            }
                        });
                        $state.set('call', '');
                    }
                },
                '#getcol': {
                    'famous:events:click': function ($event, $state) {
                        $state.set('call', {
                            resultTo: 'test3',
                            method: 'getlist',
                            payload: []
                        });
                        $state.set('call', '');
                    }
                }
            },
            states: {
                'displayPOP': 'none',
                'displayInfo': 'none',
                'iheight': 50,
                'connect': '',
                'counter': 0,
                'chat': 'this is it',
                'call': '',
                'getcol': '',
                'colres': '',
                'clicked': false,
                'results': '',
                'itemTemp': '<div>Text is: {{title}}\n                        cost is {{cost}}\n                        <button class="but" name="{{key}}" >Delete</button></div>',
                'infoContent': 'this is info'
            },
            tree: '<tutaslabs:meteor-ddp></tutaslabs:meteor-ddp>\n\n<tutaslabs:ui:popup id="pop1"></tutaslabs:ui:popup>\n\n\n<tutaslabs:ui:popup id="pop2"></tutaslabs:ui:popup>\n\n\n\n<famous:core:node id="text"></famous:core:node>\n<famous:core:node id="response"></famous:core:node>\n<famous:core:node id="button"></famous:core:node>\n<famous:core:node id="getcol"></famous:core:node>\n<famous:core:node id="results"></famous:core:node>\n<famous:core:node id="reset"></famous:core:node>\n<famous:core:node id="notice"></famous:core:node>\n\n\n<famous:core:node id="htemplate"></famous:core:node>\n\n<famous:core:node class="question"></famous:core:node>\n\n\n\n<tutaslabs:layouts:scroll-view>\n <famous:core:node class="scroll-view-item"></famous:core:node>\n</tutaslabs:layouts:scroll-view>\n\n'
        }).config({
            imports: {
                'tutaslabs:ui': ['popup'],
                'tutaslabs:layouts': ['scroll-view']
            },
            includes: [
                'htemplate.js',
                'helpers.js'
            ]
        });
    }());
    FamousFramework.markComponentAsReady("tutaslabs:test", "HEAD");
});