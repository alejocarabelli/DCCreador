#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface AppSchemeHandler : NSObject <WKURLSchemeHandler>
@property(nonatomic, strong) NSURL *resourceDirectory;
- (instancetype)initWithResourceDirectory:(NSURL *)resourceDirectory;
@end

@implementation AppSchemeHandler
- (instancetype)initWithResourceDirectory:(NSURL *)resourceDirectory {
    self = [super init];
    if (self) {
        _resourceDirectory = resourceDirectory;
    }
    return self;
}

- (NSString *)mimeTypeForExtension:(NSString *)extension {
    NSDictionary<NSString *, NSString *> *types = @{
        @"html": @"text/html",
        @"js": @"text/javascript",
        @"css": @"text/css",
        @"json": @"application/json",
        @"png": @"image/png",
        @"jpg": @"image/jpeg",
        @"jpeg": @"image/jpeg",
        @"svg": @"image/svg+xml",
        @"woff": @"font/woff",
        @"woff2": @"font/woff2"
    };
    return types[extension.lowercaseString] ?: @"application/octet-stream";
}

- (void)webView:(WKWebView *)webView startURLSchemeTask:(id<WKURLSchemeTask>)urlSchemeTask {
    NSString *requestedPath = urlSchemeTask.request.URL.path.stringByRemovingPercentEncoding ?: @"";
    while ([requestedPath hasPrefix:@"/"]) {
        requestedPath = [requestedPath substringFromIndex:1];
    }
    if (requestedPath.length == 0) {
        requestedPath = @"index.html";
    }

    NSURL *fileURL = [self.resourceDirectory URLByAppendingPathComponent:requestedPath];
    NSString *rootPath = self.resourceDirectory.URLByStandardizingPath.path;
    NSString *filePath = fileURL.URLByStandardizingPath.path;
    if (![filePath hasPrefix:[rootPath stringByAppendingString:@"/"]] && ![filePath isEqualToString:rootPath]) {
        NSError *error = [NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorNoPermissionsToReadFile userInfo:nil];
        [urlSchemeTask didFailWithError:error];
        return;
    }

    NSError *readError = nil;
    NSData *data = [NSData dataWithContentsOfURL:fileURL options:0 error:&readError];
    if (!data) {
        [urlSchemeTask didFailWithError:readError ?: [NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorFileDoesNotExist userInfo:nil]];
        return;
    }

    NSURLResponse *response = [[NSURLResponse alloc]
        initWithURL:urlSchemeTask.request.URL
        MIMEType:[self mimeTypeForExtension:fileURL.pathExtension]
        expectedContentLength:(NSInteger)data.length
        textEncodingName:[fileURL.pathExtension.lowercaseString isEqualToString:@"html"] ||
                         [fileURL.pathExtension.lowercaseString isEqualToString:@"js"] ||
                         [fileURL.pathExtension.lowercaseString isEqualToString:@"css"] ? @"utf-8" : nil];
    [urlSchemeTask didReceiveResponse:response];
    [urlSchemeTask didReceiveData:data];
    [urlSchemeTask didFinish];
}

- (void)webView:(WKWebView *)webView stopURLSchemeTask:(id<WKURLSchemeTask>)urlSchemeTask {
}
@end

@interface WebCoordinator : NSObject <WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate>
@property(nonatomic, weak) NSWindow *window;
- (instancetype)initWithWindow:(NSWindow *)window;
@end

@implementation WebCoordinator
- (instancetype)initWithWindow:(NSWindow *)window {
    self = [super init];
    if (self) {
        _window = window;
    }
    return self;
}

- (void)webView:(WKWebView *)webView
    decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction
    decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    if (navigationAction.shouldPerformDownload) {
        decisionHandler(WKNavigationActionPolicyDownload);
        return;
    }

    NSURL *url = navigationAction.request.URL;
    NSString *scheme = url.scheme.lowercaseString;
    if (navigationAction.navigationType == WKNavigationTypeLinkActivated &&
        ([scheme isEqualToString:@"http"] || [scheme isEqualToString:@"https"])) {
        [[NSWorkspace sharedWorkspace] openURL:url];
        decisionHandler(WKNavigationActionPolicyCancel);
        return;
    }

    decisionHandler(WKNavigationActionPolicyAllow);
}

- (void)webView:(WKWebView *)webView
    decidePolicyForNavigationResponse:(WKNavigationResponse *)navigationResponse
    decisionHandler:(void (^)(WKNavigationResponsePolicy))decisionHandler {
    decisionHandler(navigationResponse.canShowMIMEType
        ? WKNavigationResponsePolicyAllow
        : WKNavigationResponsePolicyDownload);
}

- (void)webView:(WKWebView *)webView
    navigationAction:(WKNavigationAction *)navigationAction
    didBecomeDownload:(WKDownload *)download {
    download.delegate = self;
}

- (void)webView:(WKWebView *)webView
    navigationResponse:(WKNavigationResponse *)navigationResponse
    didBecomeDownload:(WKDownload *)download {
    download.delegate = self;
}

- (void)download:(WKDownload *)download
    decideDestinationUsingResponse:(NSURLResponse *)response
    suggestedFilename:(NSString *)suggestedFilename
    completionHandler:(void (^)(NSURL * _Nullable destination))completionHandler {
    NSSavePanel *panel = [NSSavePanel savePanel];
    panel.nameFieldStringValue = suggestedFilename;
    panel.canCreateDirectories = YES;

    void (^finish)(NSModalResponse) = ^(NSModalResponse result) {
        completionHandler(result == NSModalResponseOK ? panel.URL : nil);
    };
    if (self.window) {
        [panel beginSheetModalForWindow:self.window completionHandler:finish];
    } else {
        [panel beginWithCompletionHandler:finish];
    }
}

- (void)webView:(WKWebView *)webView
    runOpenPanelWithParameters:(WKOpenPanelParameters *)parameters
    initiatedByFrame:(WKFrameInfo *)frame
    completionHandler:(void (^)(NSArray<NSURL *> * _Nullable URLs))completionHandler {
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.allowsMultipleSelection = parameters.allowsMultipleSelection;
    panel.canChooseDirectories = parameters.allowsDirectories;
    panel.canChooseFiles = YES;

    void (^finish)(NSModalResponse) = ^(NSModalResponse result) {
        completionHandler(result == NSModalResponseOK ? panel.URLs : nil);
    };
    if (self.window) {
        [panel beginSheetModalForWindow:self.window completionHandler:finish];
    } else {
        [panel beginWithCompletionHandler:finish];
    }
}

- (void)webView:(WKWebView *)webView
    runJavaScriptAlertPanelWithMessage:(NSString *)message
    initiatedByFrame:(WKFrameInfo *)frame
    completionHandler:(void (^)(void))completionHandler {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"Diseño de Sistemas";
    alert.informativeText = message;
    [alert addButtonWithTitle:@"Aceptar"];
    [alert beginSheetModalForWindow:self.window completionHandler:^(__unused NSModalResponse result) {
        completionHandler();
    }];
}

- (void)webView:(WKWebView *)webView
    runJavaScriptConfirmPanelWithMessage:(NSString *)message
    initiatedByFrame:(WKFrameInfo *)frame
    completionHandler:(void (^)(BOOL result))completionHandler {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"Diseño de Sistemas";
    alert.informativeText = message;
    [alert addButtonWithTitle:@"Aceptar"];
    [alert addButtonWithTitle:@"Cancelar"];
    [alert beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result) {
        completionHandler(result == NSAlertFirstButtonReturn);
    }];
}

- (void)webViewWebContentProcessDidTerminate:(WKWebView *)webView {
    [webView reload];
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    NSString *storageCheck = @"(() => { try { localStorage.setItem('__desktop_storage_test__', 'ok'); const valid = localStorage.getItem('__desktop_storage_test__') === 'ok'; localStorage.removeItem('__desktop_storage_test__'); return valid; } catch (_) { return false; } })()";
    [webView evaluateJavaScript:storageCheck completionHandler:^(id result, NSError *error) {
        if (error || ![result boolValue]) {
            NSAlert *alert = [[NSAlert alloc] init];
            alert.messageText = @"No se puede guardar localmente";
            alert.informativeText = @"La aplicación abrió correctamente, pero macOS no habilitó el almacenamiento persistente. Exportá tus proyectos como JSON antes de cerrar.";
            [alert beginSheetModalForWindow:self.window completionHandler:nil];
        }
    }];
}
@end

@interface AppDelegate : NSObject <NSApplicationDelegate>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) WebCoordinator *coordinator;
@property(nonatomic, strong) AppSchemeHandler *schemeHandler;
@end

@implementation AppDelegate
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [self configureMenus];

    NSURL *iconURL = [NSBundle.mainBundle.resourceURL URLByAppendingPathComponent:@"AppIcon.png"];
    NSImage *applicationIcon = [[NSImage alloc] initWithContentsOfURL:iconURL];
    if (applicationIcon) {
        NSApp.applicationIconImage = applicationIcon;
    }

    NSRect frame = NSMakeRect(0, 0, 1380, 860);
    self.window = [[NSWindow alloc]
        initWithContentRect:frame
        styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable |
                   NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable |
                   NSWindowStyleMaskFullSizeContentView)
        backing:NSBackingStoreBuffered
        defer:NO];
    self.window.title = @"Diseño de Sistemas";
    self.window.minSize = NSMakeSize(900, 600);
    self.window.releasedWhenClosed = NO;
    [self.window center];

    NSURL *resourceDirectory = [NSBundle.mainBundle.resourceURL URLByAppendingPathComponent:@"WebApp" isDirectory:YES];
    NSURL *indexURL = [resourceDirectory URLByAppendingPathComponent:@"index.html"];
    if (!resourceDirectory || ![[NSFileManager defaultManager] fileExistsAtPath:indexURL.path]) {
        [self presentStartupError:@"No se encontraron los recursos web dentro de la aplicación."];
        return;
    }

    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    configuration.websiteDataStore = WKWebsiteDataStore.defaultDataStore;
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = NO;
    self.schemeHandler = [[AppSchemeHandler alloc] initWithResourceDirectory:resourceDirectory];
    [configuration setURLSchemeHandler:self.schemeHandler forURLScheme:@"disenosistemas"];

    WKWebView *webView = [[WKWebView alloc] initWithFrame:NSZeroRect configuration:configuration];
    webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    webView.allowsMagnification = NO;
    self.coordinator = [[WebCoordinator alloc] initWithWindow:self.window];
    webView.navigationDelegate = self.coordinator;
    webView.UIDelegate = self.coordinator;

    self.window.contentView = webView;
    [webView loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:@"disenosistemas://app/index.html"]]];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return YES;
}

- (BOOL)applicationSupportsSecureRestorableState:(NSApplication *)app {
    return YES;
}

- (void)presentStartupError:(NSString *)message {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"No se pudo abrir Diseño de Sistemas";
    alert.informativeText = message;
    [alert runModal];
    [NSApp terminate:nil];
}

- (void)configureMenus {
    NSMenu *mainMenu = [[NSMenu alloc] init];

    NSMenuItem *applicationMenuItem = [[NSMenuItem alloc] init];
    NSMenu *applicationMenu = [[NSMenu alloc] initWithTitle:@"Aplicación"];
    [applicationMenu addItemWithTitle:@"Acerca de Diseño de Sistemas"
                               action:@selector(orderFrontStandardAboutPanel:)
                        keyEquivalent:@""];
    [applicationMenu addItem:NSMenuItem.separatorItem];
    [applicationMenu addItemWithTitle:@"Salir de Diseño de Sistemas"
                               action:@selector(terminate:)
                        keyEquivalent:@"q"];
    applicationMenuItem.submenu = applicationMenu;
    [mainMenu addItem:applicationMenuItem];

    NSMenuItem *editMenuItem = [[NSMenuItem alloc] init];
    NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Edición"];
    [editMenu addItemWithTitle:@"Deshacer" action:@selector(undo:) keyEquivalent:@"z"];
    NSMenuItem *redo = [editMenu addItemWithTitle:@"Rehacer" action:@selector(redo:) keyEquivalent:@"z"];
    redo.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagShift;
    [editMenu addItem:NSMenuItem.separatorItem];
    [editMenu addItemWithTitle:@"Cortar" action:@selector(cut:) keyEquivalent:@"x"];
    [editMenu addItemWithTitle:@"Copiar" action:@selector(copy:) keyEquivalent:@"c"];
    [editMenu addItemWithTitle:@"Pegar" action:@selector(paste:) keyEquivalent:@"v"];
    [editMenu addItemWithTitle:@"Seleccionar todo" action:@selector(selectAll:) keyEquivalent:@"a"];
    editMenuItem.submenu = editMenu;
    [mainMenu addItem:editMenuItem];

    NSMenuItem *windowMenuItem = [[NSMenuItem alloc] init];
    NSMenu *windowMenu = [[NSMenu alloc] initWithTitle:@"Ventana"];
    [windowMenu addItemWithTitle:@"Minimizar" action:@selector(performMiniaturize:) keyEquivalent:@"m"];
    [windowMenu addItemWithTitle:@"Zoom" action:@selector(performZoom:) keyEquivalent:@""];
    windowMenuItem.submenu = windowMenu;
    [mainMenu addItem:windowMenuItem];
    NSApp.windowsMenu = windowMenu;
    NSApp.mainMenu = mainMenu;
}
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *application = NSApplication.sharedApplication;
        AppDelegate *delegate = [[AppDelegate alloc] init];
        [application setActivationPolicy:NSApplicationActivationPolicyRegular];
        application.delegate = delegate;
        [application run];
    }
    return 0;
}
