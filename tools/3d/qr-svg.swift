// QR-код в SVG средствами macOS (CoreImage), без зависимостей.
//   swift tools/3d/qr-svg.swift "<текст>" <выход.svg>
import Foundation
import CoreImage

let a = CommandLine.arguments
guard a.count >= 3 else { FileHandle.standardError.write(Data("usage: qr-svg.swift <text> <out.svg>\n".utf8)); exit(2) }
guard let f = CIFilter(name: "CIQRCodeGenerator") else { exit(3) }
f.setValue(Data(a[1].utf8), forKey: "inputMessage")
f.setValue("M", forKey: "inputCorrectionLevel")
guard let img = f.outputImage else { exit(4) }
let ctx = CIContext(options: [.useSoftwareRenderer: true])
let w = Int(img.extent.width), h = Int(img.extent.height)
var px = [UInt8](repeating: 0, count: w * h * 4)
ctx.render(img, toBitmap: &px, rowBytes: w * 4, bounds: img.extent, format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
let quiet = 4
var d = ""
for y in 0..<h { var x = 0
  while x < w {
    if px[(y * w + x) * 4] < 128 { var e = x; while e < w && px[(y * w + e) * 4] < 128 { e += 1 }
      d += "M\(x + quiet) \(y + quiet)h\(e - x)v1h-\(e - x)z"; x = e } else { x += 1 } } }
let n = w + quiet * 2
let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 \(n) \(n)\" shape-rendering=\"crispEdges\"><rect width=\"\(n)\" height=\"\(n)\" fill=\"#fff\"/><path d=\"\(d)\" fill=\"#000\"/></svg>\n"
try svg.write(toFile: a[2], atomically: true, encoding: .utf8)
print("QR \(w)x\(h) модулей")
