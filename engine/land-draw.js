'use strict';
// LINEA · сборка состава ландшафтного альбома из двух частей
const A = require('./land-sheets-a');
const B = require('./land-sheets-b');
module.exports.sheets = M => [...A(M), ...B(M)];
