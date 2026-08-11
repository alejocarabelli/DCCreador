#import <Cocoa/Cocoa.h>

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc < 2) {
            fprintf(stderr, "Falta la ruta de salida del icono.\n");
            return 1;
        }

        NSSize size = NSMakeSize(1024, 1024);
        NSImage *image = [[NSImage alloc] initWithSize:size];
        [image lockFocus];

        NSRect backgroundRect = NSMakeRect(52, 52, 920, 920);
        NSBezierPath *background = [NSBezierPath bezierPathWithRoundedRect:backgroundRect xRadius:190 yRadius:190];
        [[NSColor colorWithCalibratedRed:0.08 green:0.28 blue:0.46 alpha:1] setFill];
        [background fill];

        NSBezierPath *innerBorder = [NSBezierPath bezierPathWithRoundedRect:NSInsetRect(backgroundRect, 34, 34)
                                                                    xRadius:160
                                                                    yRadius:160];
        [[NSColor colorWithCalibratedRed:0.18 green:0.55 blue:0.78 alpha:1] setStroke];
        innerBorder.lineWidth = 14;
        [innerBorder stroke];

        [[NSColor whiteColor] setStroke];
        NSArray<NSValue *> *boxes = @[
            [NSValue valueWithRect:NSMakeRect(170, 610, 350, 170)],
            [NSValue valueWithRect:NSMakeRect(610, 650, 240, 145)],
            [NSValue valueWithRect:NSMakeRect(375, 245, 420, 190)]
        ];
        for (NSValue *value in boxes) {
            NSRect rect = value.rectValue;
            NSBezierPath *box = [NSBezierPath bezierPathWithRoundedRect:rect xRadius:26 yRadius:26];
            box.lineWidth = 22;
            [box stroke];
            NSBezierPath *divider = [NSBezierPath bezierPath];
            [divider moveToPoint:NSMakePoint(NSMinX(rect), NSMaxY(rect) - 62)];
            [divider lineToPoint:NSMakePoint(NSMaxX(rect), NSMaxY(rect) - 62)];
            divider.lineWidth = 16;
            [divider stroke];
        }

        NSBezierPath *connections = [NSBezierPath bezierPath];
        [connections moveToPoint:NSMakePoint(520, 695)];
        [connections lineToPoint:NSMakePoint(610, 720)];
        [connections moveToPoint:NSMakePoint(350, 610)];
        [connections lineToPoint:NSMakePoint(470, 435)];
        [connections moveToPoint:NSMakePoint(730, 650)];
        [connections lineToPoint:NSMakePoint(650, 435)];
        connections.lineWidth = 20;
        connections.lineCapStyle = NSLineCapStyleRound;
        [connections stroke];

        [image unlockFocus];
        NSBitmapImageRep *bitmap = [NSBitmapImageRep imageRepWithData:image.TIFFRepresentation];
        NSData *png = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
        if (![png writeToFile:[NSString stringWithUTF8String:argv[1]] atomically:YES]) {
            fprintf(stderr, "No se pudo escribir el icono.\n");
            return 1;
        }
    }
    return 0;
}
