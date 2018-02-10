// Copyright 2014 The Chromium Authors. All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are
// met:
//
//    * Redistributions of source code must retain the above copyright
// notice, this list of conditions and the following disclaimer.
//    * Redistributions in binary form must reproduce the above
// copyright notice, this list of conditions and the following disclaimer
// in the documentation and/or other materials provided with the
// distribution.
//    * Neither the name of Google Inc. nor the names of its
// contributors may be used to endorse or promote products derived from
// this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
// A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
// OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

// This file contains wrappers around the Chromium Development Tool's
// JavaScript source code formatter. These wrappers were manually converted
// to TypeScript and simplified from the original source.

interface FormatRequest {
  method: "format",
  params: {
    mimeType: "text/javascript" | "text/html",
    content: string;
    indentString: string;
  }
}

interface FormatResponse {
  content: string;
  mapping: FormatMapping;
}

interface FormatMapping {
  formatted: number[];
  original: number[];
}

class PendingFormatRequest {
  constructor(
    public readonly original: string,
    public readonly success: (original: string, formatted: string, mapping: FormatterSourceMapping) => void,
    public readonly error: (e: Error) => void
  ) {}
}

export default class FormatWorker {
  public static async Create(): Promise<FormatWorker> {
    return new Promise<FormatWorker>((resolve, reject) => {
      new FormatWorker(resolve);
    });
  }
  private _w: Worker;
  private _queue: PendingFormatRequest[] = [];
  private constructor(ready: (worker: FormatWorker) => void) {
    // Use the original, unmodified worker code.
    this._w = new Worker("node_modules/chrome-devtools-frontend/front_end/formatter_worker.js");
    this._w.onmessage = (e) => {
      if (e.data === "workerReady") {
        return ready(this);
      }
      if (this._queue.length > 0) {
        const d: FormatResponse = e.data;
        const i = this._queue.shift();
        const ogLe = computeLineEndings(i.original);
        const formattedLe = computeLineEndings(d.content);
        i.success(i.original, d.content, new FormatterSourceMapping(ogLe, formattedLe, d.mapping));
      } else {
        console.error(`Received unsolicited message from FormatWorker: ${e.data}`);
      }
    };
    this._w.onerror = (e) => {
      if (this._queue.length > 0) {
        const i = this._queue.shift();
        i.error(e.error);
      } else {
        console.error(`Received uncaught error in FormatWorker: ${e.error}`);
      }
    };
  }

  public format(source: string, mimeType: "text/javascript" | "text/html", onsuccess: (original: string, formatted: string, mapping: FormatterSourceMapping) => void, onerror: (e: Error) => void): void {
    const req: FormatRequest = {
      method: "format",
      params: {
        mimeType: mimeType,
        content: source,
        indentString: "  "
      }
    };
    this._queue.push(new PendingFormatRequest(source, onsuccess, onerror));
    this._w.postMessage(req);
  }
}

function findAll(str: string, toFind: string): number[] {
  var matches = [];
  var i = str.indexOf(toFind);
  while (i !== -1) {
    matches.push(i);
    i = str.indexOf(toFind, i + toFind.length);
  }
  return matches;
};

function computeLineEndings(str: string): number[] {
  const endings = findAll(str, '\n');
  endings.push(str.length);
  return endings;
}

function defaultComparator(a: number, b: number): number {
  return a < b ? -1 : (a > b ? 1 : 0);
}

function upperBound(arr: number[], item: number) {
  var l = 0;
  var r = arr.length;
  while (l < r) {
    var m = (l + r) >> 1;
    if (defaultComparator(item, arr[m]) >= 0)
      l = m + 1;
    else
      r = m;
  }
  return r;
}

export class FormatterSourceMapping {
  public static locationToPosition(lineEndings: number[], lineNumber: number, columnNumber: number): number {
    var position = lineNumber ? lineEndings[lineNumber - 1] + 1 : 0;
    return position + columnNumber;
  }

  public static positionToLocation(lineEndings: number[], position: number): [number, number] {
    var lineNumber = upperBound(lineEndings, position - 1);
    if (!lineNumber)
      var columnNumber = position;
    else
      var columnNumber = position - lineEndings[lineNumber - 1] - 1;
    return [lineNumber, columnNumber];
  }


  constructor(private readonly _originalLineEndings: number[],
    private readonly _formattedLineEndings: number[],
    private readonly _mapping: FormatMapping) {}

  public originalToFormatted(lineNumber: number, columnNumber: number): [number, number] {
    var originalPosition =
      FormatterSourceMapping.locationToPosition(this._originalLineEndings, lineNumber, columnNumber || 0);
    var formattedPosition =
        this._convertPosition(this._mapping.original, this._mapping.formatted, originalPosition || 0);
    return FormatterSourceMapping.positionToLocation(this._formattedLineEndings, formattedPosition);
  }

  public formattedToOriginal(lineNumber: number, columnNumber: number): [number, number] {
    var formattedPosition =
      FormatterSourceMapping.locationToPosition(this._formattedLineEndings, lineNumber, columnNumber || 0);
    var originalPosition = this._convertPosition(this._mapping.formatted, this._mapping.original, formattedPosition);
    return FormatterSourceMapping.positionToLocation(this._originalLineEndings, originalPosition || 0);
  }

  private _convertPosition(positions1: number[], positions2: number[], position: number): number {
    var index = upperBound(positions1, position) - 1;
    var convertedPosition = positions2[index] + position - positions1[index];
    if (index < positions2.length - 1 && convertedPosition > positions2[index + 1])
      convertedPosition = positions2[index + 1];
    return convertedPosition;
  }
}