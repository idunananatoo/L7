/**
 * 对于 polyline-normal 的改进
 * 超过阈值，miter 转成 bevel 接头，
 * 要注意 Three.js 中默认 THREE.FrontFaceDirectionCCW
 * @see https://zhuanlan.zhihu.com/p/59541559
 */
import { direction, normal, computeMiter } from 'polyline-miter-util';
import { create, copy, dot } from 'gl-vec2';

function extrusions(positions, out, point, normal, scale) {
  addNext(out, normal, -scale);
  addNext(out, normal, scale);
  positions.push(point);
  positions.push(point);
}

function addNext(out, normal, length) {
  out.push([[ normal[0], normal[1] ], length ]);
}

export default function(points, closed, indexOffset) {
  const lineA = [ 0, 0 ];
  const lineB = [ 0, 0 ];
  const tangent = [ 0, 0 ];
  const miter = [ 0, 0 ];
  let _lastFlip = -1;
  let _started = false;
  let _normal = null;
  const tmp = create();
  let count = indexOffset || 0;
  const miterLimit = 3;

  const out = [];
  const attrPos = [];
  const attrIndex = [];
  const attrCounters = [ 0, 0 ];
  if (closed) {
    points = points.slice();
    points.push(points[0]);
  }

  const total = points.length;

  for (let i = 1; i < total; i++) {
    const index = count;
    const last = points[i - 1];
    const cur = points[i];
    const next = i < points.length - 1 ? points[i + 1] : null;

    attrCounters.push(i / total, i / total);

    direction(lineA, cur, last);

    if (!_normal) {
      _normal = [ 0, 0 ];
      normal(_normal, lineA);
    }

    if (!_started) {
      _started = true;
      extrusions(attrPos, out, last, _normal, 1);
    }

    attrIndex.push([ index + 0, index + 3, index + 1 ]);

     // no miter, simple segment
    if (!next) {
       // reset normal
      normal(_normal, lineA);
      extrusions(attrPos, out, cur, _normal, 1);
      attrIndex.push(
        _lastFlip === 1 ? [ index + 1, index + 3, index + 2 ] : [ index, index + 2, index + 3 ]);

      count += 2;
    } else {
      // get unit dir of next line
      direction(lineB, next, cur);

      // stores tangent & miter
      let miterLen = computeMiter(tangent, miter, lineA, lineB, 1);

      // get orientation
      let flip = (dot(tangent, _normal) < 0) ? -1 : 1;
      const bevel = miterLen > miterLimit;
      if (bevel) {
        miterLen = miterLimit;
        attrCounters.push(i / total);

        // next two points in our first segment
        addNext(out, _normal, -flip);
        attrPos.push(cur);
        addNext(out, miter, miterLen * flip);
        attrPos.push(cur);

        attrIndex.push(_lastFlip !== -flip
          ? [ index + 1, index + 3, index + 2 ] : [ index, index + 2, index + 3 ]);

        // now add the bevel triangle
        attrIndex.push([ index + 2, index + 3, index + 4 ]);

        normal(tmp, lineB);
        copy(_normal, tmp); // store normal for next round

        addNext(out, _normal, -flip);
        attrPos.push(cur);

        // the miter is now the normal for our next join
        count += 3;
      } else {
        // next two points for our miter join
        extrusions(attrPos, out, cur, miter, miterLen);
        attrIndex.push(_lastFlip === 1
          ? [ index + 1, index + 3, index + 2 ] : [ index, index + 2, index + 3 ]);

        flip = -1;

        // the miter is now the normal for our next join
        copy(_normal, miter);
        count += 2;
      }
      _lastFlip = flip;
    }
  }

  return {
    normals: out,
    attrIndex,
    attrPos,
    attrCounters
  };
}
