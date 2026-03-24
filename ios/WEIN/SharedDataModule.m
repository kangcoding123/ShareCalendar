#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SharedDataModule, NSObject)

RCT_EXTERN_METHOD(updateWidgetData:(NSString *)jsonString)
RCT_EXTERN_METHOD(reloadWidget)

@end
