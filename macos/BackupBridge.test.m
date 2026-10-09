// Exercise the production bridge with a temporary directory, without opening the app.
#define main modeladorAppMain
#import "AppMain.m"
#undef main

static NSURL *testDirectory;
static NSUInteger pruneCalls;

@interface TestBackupBridge : BackupBridge
@end
@implementation TestBackupBridge
+ (NSURL *)backupDirectoryCreatingIfNeeded:(NSError **)error {
    return testDirectory;
}
+ (void)pruneBackupsIn:(NSURL *)directory {
    pruneCalls++;
    [super pruneBackupsIn:directory];
}
@end

@interface TestBackupMessage : NSObject
@property(nonatomic, strong) NSDictionary *body;
@end
@implementation TestBackupMessage
@end

static NSString *sendBackup(NSString *action, NSString *payload) {
    TestBackupMessage *message = [TestBackupMessage new];
    message.body = @{@"action": action, @"payload": payload};
    __block NSString *path = nil;
    [[TestBackupBridge new] userContentController:[WKUserContentController new]
                         didReceiveScriptMessage:(WKScriptMessage *)message
                                    replyHandler:^(id reply, NSString *error) {
        NSCAssert(error == nil, @"Unexpected bridge error: %@", error);
        path = reply[@"path"];
        NSCAssert([reply[@"directory"] isEqualToString:testDirectory.path], @"Wrong directory");
    }];
    NSCAssert(path != nil, @"The bridge must return a file path");
    return path;
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSCAssert(argc == 2, @"Expected a temporary directory");
        testDirectory = [[NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]] isDirectory:YES] URLByResolvingSymlinksInPath];
        NSFileManager *files = NSFileManager.defaultManager;
        NSError *error = nil;
        NSString *payload = @"{\"version\":2,\"projects\":[]}";
        // More than the rotation limit: identical writes must not prune, either.
        for (NSUInteger i = 0; i < 11; i++) {
            NSURL *file = [testDirectory URLByAppendingPathComponent:[NSString stringWithFormat:@"respaldo-seed-%lu.json", (unsigned long)i]];
            NSCAssert([payload writeToURL:file atomically:YES encoding:NSUTF8StringEncoding error:&error], @"Seed write failed");
            NSCAssert([files setAttributes:@{NSFileModificationDate: [NSDate dateWithTimeIntervalSince1970:100 + i]} ofItemAtPath:file.path error:&error], @"Seed date failed");
        }
        NSURL *latest = [TestBackupBridge backupsIn:testDirectory].firstObject;
        NSString *duplicate = sendBackup(@"write", payload);
        NSCAssert([duplicate.lastPathComponent isEqualToString:latest.lastPathComponent], @"Must return the newest existing backup");
        NSCAssert(pruneCalls == 0 && [TestBackupBridge backupsIn:testDirectory].count == 11, @"Identical content must not write or prune");

        NSString *changed = sendBackup(@"write", @"changed");
        NSCAssert(![changed isEqualToString:duplicate], @"Changed content must be written");
        NSCAssert(pruneCalls == 1 && [TestBackupBridge backupsIn:testDirectory].count == 10, @"Changed content must rotate");
        // Older files contain payload, but only the most recent one is compared.
        NSString *repeated = sendBackup(@"write", payload);
        NSCAssert(![repeated isEqualToString:duplicate], @"Must not deduplicate against older content");
        NSCAssert(pruneCalls == 2, @"Older matching content must not skip rotation");
        NSString *again = sendBackup(@"write", payload);
        NSCAssert([again.lastPathComponent isEqualToString:repeated.lastPathComponent], @"Consecutive duplicate must reuse existing path: %@ vs %@", again, repeated);
        NSCAssert(pruneCalls == 2, @"Duplicate must not prune");

        NSCAssert([files removeItemAtPath:repeated error:&error], @"Delete failed");
        NSString *recreated = sendBackup(@"write", payload);
        NSCAssert([files fileExistsAtPath:recreated], @"Deleted backup must be recreated");
        NSCAssert(pruneCalls == 3, @"Recreated backup must rotate");

        NSString *recovery = sendBackup(@"preserve", payload);
        NSString *otherRecovery = sendBackup(@"preserve", payload);
        NSCAssert(![recovery isEqualToString:otherRecovery], @"Preserve must always write a separate copy");
        NSCAssert([files fileExistsAtPath:recovery] && [files fileExistsAtPath:otherRecovery], @"Both originals must exist");
        NSCAssert(pruneCalls == 3, @"Preserve must not prune");

        NSURL *moved = [testDirectory URLByAppendingPathComponent:@"moved" isDirectory:YES];
        NSCAssert([files createDirectoryAtURL:moved withIntermediateDirectories:YES attributes:nil error:&error], @"Move directory failed");
        for (NSURL *file in [TestBackupBridge backupsIn:testDirectory]) {
            NSCAssert([files moveItemAtURL:file toURL:[moved URLByAppendingPathComponent:file.lastPathComponent] error:&error], @"Move failed");
        }
        // A directory named like a backup is not a snapshot; recoveries are excluded.
        NSCAssert([files createDirectoryAtURL:[testDirectory URLByAppendingPathComponent:@"respaldo-folder.json"] withIntermediateDirectories:YES attributes:nil error:&error], @"Folder failed");
        NSString *afterMove = sendBackup(@"write", payload);
        NSCAssert([files fileExistsAtPath:afterMove] && [TestBackupBridge backupsIn:testDirectory].count == 1, @"Moved backups must not suppress a new copy");
        NSCAssert([files fileExistsAtPath:recovery] && [files fileExistsAtPath:otherRecovery], @"Recoveries must remain outside rotation");
        puts("BackupBridge: identical, changed, deleted, moved and preserve checks passed");
    }
    return 0;
}
