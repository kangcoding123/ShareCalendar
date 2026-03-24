import Foundation
import WidgetKit

@objc(SharedDataModule)
class SharedDataModule: NSObject {

  @objc
  func updateWidgetData(_ jsonString: String) {
    guard let sharedDefaults = UserDefaults(suiteName: WidgetConstants.appGroupId) else {
      return
    }
    sharedDefaults.set(jsonString, forKey: WidgetConstants.widgetDataKey)
    sharedDefaults.synchronize()

    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
  }

  @objc
  func reloadWidget() {
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
