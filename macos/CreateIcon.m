#import <Cocoa/Cocoa.h>

/*
 * Ícono de la app: la marca de la barra lateral (el ícono Blocks de Lucide) en
 * blanco sobre el petróleo del tema claro, con el bloque suelto en el petróleo
 * claro del tema oscuro (src/theme/themes.ts).
 */

static NSColor *Hex(unsigned int rgb, CGFloat alpha) {
    return [NSColor colorWithSRGBRed:((rgb >> 16) & 0xFF) / 255.0
                               green:((rgb >> 8) & 0xFF) / 255.0
                                blue:(rgb & 0xFF) / 255.0
                               alpha:alpha];
}

static void StrokeGlyph(NSBezierPath *path, CGFloat width, NSColor *color) {
    path.lineWidth = width;
    path.lineJoinStyle = NSLineJoinStyleRound;
    path.lineCapStyle = NSLineCapStyleRound;
    [color setStroke];
    [path stroke];
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc < 2) {
            fprintf(stderr, "Falta la ruta de salida del icono.\n");
            return 1;
        }

        NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc] initWithBitmapDataPlanes:NULL
                                                                           pixelsWide:1024
                                                                           pixelsHigh:1024
                                                                        bitsPerSample:8
                                                                      samplesPerPixel:4
                                                                             hasAlpha:YES
                                                                             isPlanar:NO
                                                                       colorSpaceName:NSDeviceRGBColorSpace
                                                                          bytesPerRow:0
                                                                         bitsPerPixel:0];
        bitmap.size = NSMakeSize(1024, 1024);
        [NSGraphicsContext saveGraphicsState];
        NSGraphicsContext.currentContext = [NSGraphicsContext graphicsContextWithBitmapImageRep:bitmap];

        // Fondo: la grilla de íconos de macOS (824 px con 100 px de margen).
        NSBezierPath *tile = [NSBezierPath bezierPathWithRoundedRect:NSMakeRect(100, 100, 824, 824)
                                                             xRadius:185
                                                             yRadius:185];
        NSColor *petrolTop = Hex(0x24808C, 1);
        NSColor *petrolBottom = Hex(0x165660, 1);
        [NSGraphicsContext saveGraphicsState];
        NSShadow *shadow = [[NSShadow alloc] init];
        shadow.shadowColor = Hex(0x1C2326, 0.30);
        shadow.shadowOffset = NSMakeSize(0, -12);
        shadow.shadowBlurRadius = 24;
        [shadow set];
        [petrolBottom setFill];
        [tile fill];
        [NSGraphicsContext restoreGraphicsState];
        [[[NSGradient alloc] initWithStartingColor:petrolBottom endingColor:petrolTop] drawInBezierPath:tile angle:90];

        // Glifo Blocks en su grilla de 24 unidades, centrado y escalado.
        CGFloat scale = 25;
        NSPoint (^point)(CGFloat, CGFloat) = ^NSPoint(CGFloat x, CGFloat y) {
            return NSMakePoint(512 + (x - 12) * scale, 512 - (y - 12) * scale);
        };

        NSBezierPath *blocks = [NSBezierPath bezierPath];
        [blocks moveToPoint:point(10, 21)];
        [blocks lineToPoint:point(10, 6)];
        [blocks lineToPoint:point(2, 6)];
        [blocks lineToPoint:point(2, 21)];
        [blocks lineToPoint:point(17, 21)];
        [blocks lineToPoint:point(17, 13)];
        [blocks lineToPoint:point(2, 13)];
        StrokeGlyph(blocks, 2 * scale, NSColor.whiteColor);

        NSBezierPath *looseBlock = [NSBezierPath bezierPath];
        [looseBlock moveToPoint:point(14, 2)];
        [looseBlock lineToPoint:point(22, 2)];
        [looseBlock lineToPoint:point(22, 10)];
        [looseBlock lineToPoint:point(14, 10)];
        [looseBlock closePath];
        StrokeGlyph(looseBlock, 2 * scale, Hex(0x63B7BC, 1));

        [NSGraphicsContext restoreGraphicsState];

        NSData *png = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
        if (![png writeToFile:[NSString stringWithUTF8String:argv[1]] atomically:YES]) {
            fprintf(stderr, "No se pudo escribir el icono.\n");
            return 1;
        }
    }
    return 0;
}
