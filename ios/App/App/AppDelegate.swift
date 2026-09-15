import UIKit
import Capacitor
import UserNotifications
import Security

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        if let url = launchOptions?[.url] as? URL {
            UserDefaults.standard.set(url.absoluteString, forKey: "ma_pending_deeplink")
        }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "il.co.mashachachti.app",
            kSecAttrAccount as String: "push_token"
        ]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = token.data(using: .utf8)
        SecItemAdd(add as CFDictionary, nil)
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        UserDefaults.standard.set(url.absoluteString, forKey: "ma_pending_deeplink")
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb,
           let url = userActivity.webpageURL {
            UserDefaults.standard.set(url.absoluteString, forKey: "ma_pending_deeplink")
        }
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
