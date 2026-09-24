#import <Cocoa/Cocoa.h>

/*
 * Ícono "Cuaderno técnico": una hoja de papel con grilla de puntos, una clase
 * UML impresa en tinta y una segunda clase seleccionada en petróleo, unidas por
 * una asociación. Mismos colores que el tema claro (src/theme/themes.ts).
 */

static NSColor *Hex(unsigned int rgb, CGFloat alpha) {
    return [NSColor colorWithSRGBRed:((rgb >> 16) & 0xFF) / 255.0
                               green:((rgb >> 8) & 0xFF) / 255.0
                                blue:(rgb & 0xFF) / 255.0
                               alpha:alpha];
}

static void FillRounded(NSRect rect, CGFloat radius, NSColor *color) {
    [color setFill];
    [[NSBezierPath bezierPathWithRoundedRect:rect xRadius:radius yRadius:radius] fill];
}

static void Line(NSPoint from, NSPoint to, CGFloat width, NSColor *color) {
    NSBezierPath *path = [NSBezierPath bezierPath];
    [path moveToPoint:from];
    [path lineToPoint:to];
    path.lineWidth = width;
    [color setStroke];
    [path stroke];
}

/* Una caja de clase: nombre, atributos y métodos como trazos de texto. */
static void DrawClass(NSRect rect, CGFloat header, NSArray<NSNumber *> *attributes,
                      NSArray<NSNumber *> *methods, NSColor *border, CGFloat scale) {
    NSColor *ink = Hex(0x1C2326, 1);
    NSColor *muted = Hex(0x5F6668, 1);
    CGFloat borderWidth = 14 * scale;
    CGFloat radius = 12 * scale;
    CGFloat barHeight = 22 * scale;
    CGFloat rowGap = 46 * scale;
    CGFloat inset = 42 * scale;

    FillRounded(NSOffsetRect(rect, 22 * scale, -22 * scale), radius, Hex(0x1C2326, 0.10));
    FillRounded(rect, radius, NSColor.whiteColor);

    CGFloat top = NSMaxY(rect);
    CGFloat nameWidth = NSWidth(rect) * 0.5;
    FillRounded(NSMakeRect(NSMidX(rect) - nameWidth / 2, top - header / 2 - 17 * scale, nameWidth, 34 * scale),
                17 * scale, ink);

    CGFloat dividerY = top - header;
    Line(NSMakePoint(NSMinX(rect), dividerY), NSMakePoint(NSMaxX(rect), dividerY), 10 * scale, border);

    CGFloat y = dividerY - 30 * scale - barHeight;
    for (NSNumber *fraction in attributes) {
        FillRounded(NSMakeRect(NSMinX(rect) + inset, y, (NSWidth(rect) - 2 * inset) * fraction.doubleValue, barHeight),
                    barHeight / 2, muted);
        y -= rowGap;
    }

    if (methods.count > 0) {
        CGFloat methodsDivider = y + rowGap - 30 * scale;
        Line(NSMakePoint(NSMinX(rect), methodsDivider), NSMakePoint(NSMaxX(rect), methodsDivider), 10 * scale, border);
        y = methodsDivider - 30 * scale - barHeight;
        for (NSNumber *fraction in methods) {
            FillRounded(NSMakeRect(NSMinX(rect) + inset, y, (NSWidth(rect) - 2 * inset) * fraction.doubleValue, barHeight),
                        barHeight / 2, muted);
            y -= rowGap;
        }
    }

    NSBezierPath *frame = [NSBezierPath bezierPathWithRoundedRect:NSInsetRect(rect, borderWidth / 2, borderWidth / 2)
                                                          xRadius:radius
                                                          yRadius:radius];
    frame.lineWidth = borderWidth;
    [border setStroke];
    [frame stroke];
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

        NSColor *ink = Hex(0x3B4347, 1);
        NSColor *petrol = Hex(0x1C6570, 1);

        // Hoja: la grilla de íconos de macOS (824 px con 100 px de margen).
        NSRect tile = NSMakeRect(100, 100, 824, 824);
        NSBezierPath *sheet = [NSBezierPath bezierPathWithRoundedRect:tile xRadius:185 yRadius:185];
        [NSGraphicsContext saveGraphicsState];
        NSShadow *shadow = [[NSShadow alloc] init];
        shadow.shadowColor = Hex(0x1C2326, 0.28);
        shadow.shadowOffset = NSMakeSize(0, -12);
        shadow.shadowBlurRadius = 24;
        [shadow set];
        [Hex(0xF8F7F3, 1) setFill];
        [sheet fill];
        [NSGraphicsContext restoreGraphicsState];

        // Grilla de puntos del lienzo.
        [NSGraphicsContext saveGraphicsState];
        [sheet addClip];
        [Hex(0xE0DBCF, 1) setFill];
        for (CGFloat x = 124; x < 924; x += 52) {
            for (CGFloat y = 124; y < 924; y += 52) {
                [[NSBezierPath bezierPathWithOvalInRect:NSMakeRect(x - 5, y - 5, 10, 10)] fill];
            }
        }
        [NSGraphicsContext restoreGraphicsState];

        NSBezierPath *edge = [NSBezierPath bezierPathWithRoundedRect:NSInsetRect(tile, 2, 2) xRadius:183 yRadius:183];
        edge.lineWidth = 4;
        [Hex(0xC9C2B3, 1) setStroke];
        [edge stroke];

        // Asociación entre las dos clases (por detrás de las cajas).
        NSRect mainClass = NSMakeRect(196, 214, 404, 452);
        NSRect selectedClass = NSMakeRect(596, 622, 236, 206);
        NSBezierPath *association = [NSBezierPath bezierPath];
        [association moveToPoint:NSMakePoint(NSMaxX(mainClass) - 10, 470)];
        [association lineToPoint:NSMakePoint(NSMidX(selectedClass), 470)];
        [association lineToPoint:NSMakePoint(NSMidX(selectedClass), NSMinY(selectedClass) + 10)];
        association.lineWidth = 16;
        association.lineJoinStyle = NSLineJoinStyleRound;
        [petrol setStroke];
        [association stroke];

        DrawClass(mainClass, 118, @[@0.86, @0.64, @0.76], @[@0.7, @0.52], ink, 1);
        DrawClass(selectedClass, 78, @[@0.8, @0.56], @[], petrol, 0.78);

        // Tiradores de selección en las esquinas de la clase seleccionada.
        for (NSValue *value in @[
                 [NSValue valueWithPoint:NSMakePoint(NSMinX(selectedClass), NSMinY(selectedClass))],
                 [NSValue valueWithPoint:NSMakePoint(NSMaxX(selectedClass), NSMinY(selectedClass))],
                 [NSValue valueWithPoint:NSMakePoint(NSMinX(selectedClass), NSMaxY(selectedClass))],
                 [NSValue valueWithPoint:NSMakePoint(NSMaxX(selectedClass), NSMaxY(selectedClass))]]) {
            NSPoint corner = value.pointValue;
            NSRect handle = NSMakeRect(corner.x - 17, corner.y - 17, 34, 34);
            FillRounded(handle, 6, NSColor.whiteColor);
            NSBezierPath *handleBorder = [NSBezierPath bezierPathWithRoundedRect:NSInsetRect(handle, 4, 4) xRadius:4 yRadius:4];
            handleBorder.lineWidth = 8;
            [petrol setStroke];
            [handleBorder stroke];
        }

        [NSGraphicsContext restoreGraphicsState];

        NSData *png = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
        if (![png writeToFile:[NSString stringWithUTF8String:argv[1]] atomically:YES]) {
            fprintf(stderr, "No se pudo escribir el icono.\n");
            return 1;
        }
    }
    return 0;
}
