/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./public/scripts/language-animation.js":
/*!**********************************************!*\
  !*** ./public/scripts/language-animation.js ***!
  \**********************************************/
/***/ (() => {

eval("function _typeof(o) { \"@babel/helpers - typeof\"; return _typeof = \"function\" == typeof Symbol && \"symbol\" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && \"function\" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? \"symbol\" : typeof o; }, _typeof(o); }\nfunction _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError(\"Cannot call a class as a function\"); }\nfunction _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, \"value\" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }\nfunction _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, \"prototype\", { writable: !1 }), e; }\nfunction _toPropertyKey(t) { var i = _toPrimitive(t, \"string\"); return \"symbol\" == _typeof(i) ? i : i + \"\"; }\nfunction _toPrimitive(t, r) { if (\"object\" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || \"default\"); if (\"object\" != _typeof(i)) return i; throw new TypeError(\"@@toPrimitive must return a primitive value.\"); } return (\"string\" === r ? String : Number)(t); }\nvar greetings = ['こんにちは',\n// Japanese\n'안녕하세요',\n// Korean\n'Hola',\n// Spanish\n'Bonjour',\n// French\n'Ciao',\n// Italian\n'Привет',\n// Russian\n'你好',\n// Chinese\n'नमस्ते',\n// Hindi\n'Hallo',\n// German\n'Olá',\n// Portuguese\n'مرحبا',\n// Arabic\n'Γεια σας',\n// Greek\n'สวัสดี',\n// Thai\n'שָׁלוֹם',\n// Hebrew\n'Xin chào' // Vietnamese\n];\nvar FloatingText = /*#__PURE__*/function () {\n  function FloatingText() {\n    _classCallCheck(this, FloatingText);\n    this.element = document.createElement('div');\n    this.element.className = 'floating-text';\n    document.body.appendChild(this.element);\n    this.startAnimation();\n  }\n  return _createClass(FloatingText, [{\n    key: \"startAnimation\",\n    value: function startAnimation() {\n      var greeting = greetings[Math.floor(Math.random() * greetings.length)];\n      this.element.textContent = greeting;\n\n      // Random size between 0.8rem and 2rem\n      var size = Math.random() * (2 - 0.8) + 0.8;\n      this.element.style.fontSize = \"\".concat(size, \"rem\");\n\n      // Random starting position (both X and Y)\n      var startX = Math.random() * 90 + 5; // 5% to 95% of viewport width\n      var startY = Math.random() * 20 + 90; // 90% to 110% of viewport height\n      this.element.style.left = \"\".concat(startX, \"vw\");\n      this.element.style.top = \"\".concat(startY, \"vh\");\n\n      // Random duration between 4-8 seconds\n      var duration = Math.random() * (8 - 4) + 4;\n\n      // Reset animation\n      this.element.style.animation = 'none';\n      this.element.offsetHeight; // Trigger reflow\n      this.element.style.animation = \"float \".concat(duration, \"s linear\");\n    }\n  }]);\n}(); // Create and manage floating texts\nvar createFloatingTexts = function createFloatingTexts() {\n  var texts = [];\n  var numTexts = 15; // Number of floating texts\n  var _loop = function _loop() {\n    var text = new FloatingText();\n    texts.push(text);\n\n    // Restart animation when it ends\n    text.element.addEventListener('animationend', function () {\n      text.startAnimation();\n    });\n\n    // Stagger the start times\n    setTimeout(function () {\n      text.startAnimation();\n    }, i * 500); // 500ms delay between each text's first appearance\n  };\n  for (var i = 0; i < numTexts; i++) {\n    _loop();\n  }\n};\n\n// Start animations when document is loaded\ndocument.addEventListener('DOMContentLoaded', createFloatingTexts);\n\n//# sourceURL=webpack://gengo/./public/scripts/language-animation.js?");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = {};
/******/ 	__webpack_modules__["./public/scripts/language-animation.js"]();
/******/ 	
/******/ })()
;