import Foundation
import Capacitor
import AVFoundation
import AuthenticationServices
import CryptoKit
import Security
import UIKit
import UserNotifications

@objc(MaNativePlugin)
public class MaNativePlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
  public let identifier = "MaNativePlugin"
  public let jsName = "MaNative"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "getPlatform", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getAppVersion", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getBuildNumber", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getInstallationId", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "authenticateWithApple", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "authenticateWithGoogle", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "requestNotificationPermission", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getNotificationPermissionState", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getPushToken", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "requestMicrophonePermission", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getMicrophonePermissionState", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "startAudioCapture", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "stopAudioCapture", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getInitialDeepLink", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getPendingSharedPayload", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "clearSharedPayload", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "pickImage", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "captureImage", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getTimezone", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "secureGet", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "secureSet", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "secureRemove", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "stageBlob", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "readStaged", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "clearStaged", returnType: CAPPluginReturnPromise),
  ]

  private let service = "il.co.mashachachti.app"
  private var appleCall: CAPPluginCall?
  private var appleNonce: String?
  private var audioRecorder: AVAudioRecorder?
  private var recordingURL: URL?

  @objc func getPlatform(_ call: CAPPluginCall) { call.resolve(["value": "ios"]) }

  @objc func getAppVersion(_ call: CAPPluginCall) {
    let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
    call.resolve(["value": version])
  }

  @objc func getBuildNumber(_ call: CAPPluginCall) {
    let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
    call.resolve(["value": build])
  }

  @objc func getInstallationId(_ call: CAPPluginCall) {
    if let existing = keychainGet("installation_id") {
      call.resolve(["value": existing])
      return
    }
    let id = UUID().uuidString
    keychainSet("installation_id", id)
    call.resolve(["value": id])
  }

  @objc func authenticateWithApple(_ call: CAPPluginCall) {
    let nonce = UUID().uuidString
    appleNonce = nonce
    appleCall = call
    let request = ASAuthorizationAppleIDProvider().createRequest()
    request.requestedScopes = [.fullName, .email]
    request.nonce = sha256(nonce)
    let controller = ASAuthorizationController(authorizationRequests: [request])
    controller.delegate = self
    controller.presentationContextProvider = self
    controller.performRequests()
  }

  @objc func authenticateWithGoogle(_ call: CAPPluginCall) {
    call.resolve([
      "status": "unavailable",
      "reason": "התחברות Google זמינה באפליקציית Android."
    ])
  }

  @objc func requestNotificationPermission(_ call: CAPPluginCall) {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
      DispatchQueue.main.async {
        call.resolve(["value": granted ? "GRANTED" : "DENIED"])
        if granted {
          UIApplication.shared.registerForRemoteNotifications()
        }
      }
    }
  }

  @objc func getNotificationPermissionState(_ call: CAPPluginCall) {
    UNUserNotificationCenter.current().getNotificationSettings { settings in
      let value: String
      switch settings.authorizationStatus {
      case .authorized, .provisional, .ephemeral: value = "GRANTED"
      case .denied: value = "DENIED"
      case .notDetermined: value = "UNKNOWN"
      @unknown default: value = "UNKNOWN"
      }
      call.resolve(["value": value])
    }
  }

  @objc func getPushToken(_ call: CAPPluginCall) {
    call.resolve(["value": keychainGet("push_token") as Any])
  }

  @objc func requestMicrophonePermission(_ call: CAPPluginCall) {
    AVAudioSession.sharedInstance().requestRecordPermission { granted in
      call.resolve(["value": granted ? "GRANTED" : "DENIED"])
    }
  }

  @objc func getMicrophonePermissionState(_ call: CAPPluginCall) {
    switch AVAudioSession.sharedInstance().recordPermission {
    case .granted: call.resolve(["value": "GRANTED"])
    case .denied: call.resolve(["value": "DENIED"])
    case .undetermined: call.resolve(["value": "UNKNOWN"])
    @unknown default: call.resolve(["value": "UNKNOWN"])
    }
  }

  @objc func startAudioCapture(_ call: CAPPluginCall) {
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
      try session.setActive(true)
      let url = FileManager.default.temporaryDirectory.appendingPathComponent("ma-capture-\(UUID().uuidString).m4a")
      let settings: [String: Any] = [
        AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
        AVSampleRateKey: 44100,
        AVNumberOfChannelsKey: 1,
        AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
      ]
      audioRecorder = try AVAudioRecorder(url: url, settings: settings)
      recordingURL = url
      audioRecorder?.record()
      call.resolve(["status": "ok"])
    } catch {
      call.resolve(["status": "error", "message": error.localizedDescription])
    }
  }

  @objc func stopAudioCapture(_ call: CAPPluginCall) {
    audioRecorder?.stop()
    defer {
      audioRecorder = nil
    }
    guard let url = recordingURL, let data = try? Data(contentsOf: url) else {
      call.resolve(["status": "error", "message": "empty"])
      return
    }
    call.resolve([
      "status": "ok",
      "mimeType": "audio/mp4",
      "base64": data.base64EncodedString(),
      "durationMs": 0
    ])
  }

  @objc func getInitialDeepLink(_ call: CAPPluginCall) {
    if let href = UserDefaults.standard.string(forKey: "ma_pending_deeplink") {
      UserDefaults.standard.removeObject(forKey: "ma_pending_deeplink")
      call.resolve(["href": href, "receivedAt": ISO8601DateFormatter().string(from: Date())])
      return
    }
    call.resolve(["value": NSNull()])
  }

  @objc func getPendingSharedPayload(_ call: CAPPluginCall) {
    let defaults = UserDefaults(suiteName: "group.il.co.mashachachti.app")
    if let data = defaults?.data(forKey: "pending_share"),
       let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      call.resolve(obj)
      return
    }
    call.resolve(["value": NSNull()])
  }

  @objc func clearSharedPayload(_ call: CAPPluginCall) {
    UserDefaults(suiteName: "group.il.co.mashachachti.app")?.removeObject(forKey: "pending_share")
    call.resolve()
  }

  @objc func pickImage(_ call: CAPPluginCall) { call.resolve(["status": "unavailable"]) }
  @objc func captureImage(_ call: CAPPluginCall) { call.resolve(["status": "unavailable"]) }

  @objc func openAppSettings(_ call: CAPPluginCall) {
    if let url = URL(string: UIApplication.openSettingsURLString) {
      DispatchQueue.main.async { UIApplication.shared.open(url) }
    }
    call.resolve()
  }

  @objc func getTimezone(_ call: CAPPluginCall) {
    call.resolve(["value": TimeZone.current.identifier])
  }

  @objc func secureGet(_ call: CAPPluginCall) {
    call.resolve(["value": keychainGet(call.getString("key") ?? "") as Any])
  }

  @objc func secureSet(_ call: CAPPluginCall) {
    keychainSet(call.getString("key") ?? "", call.getString("value") ?? "")
    call.resolve()
  }

  @objc func secureRemove(_ call: CAPPluginCall) {
    keychainDelete(call.getString("key") ?? "")
    call.resolve()
  }

  @objc func stageBlob(_ call: CAPPluginCall) {
    keychainSet("stage:" + (call.getString("key") ?? ""), call.getString("value") ?? "")
    call.resolve()
  }

  @objc func readStaged(_ call: CAPPluginCall) {
    call.resolve(["value": keychainGet("stage:" + (call.getString("key") ?? "")) as Any])
  }

  @objc func clearStaged(_ call: CAPPluginCall) {
    keychainDelete("stage:" + (call.getString("key") ?? ""))
    call.resolve()
  }

  public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    UIApplication.shared.windows.first { $0.isKeyWindow } ?? ASPresentationAnchor()
  }

  public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
    guard let call = appleCall else { return }
    appleCall = nil
    guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
          let tokenData = credential.identityToken,
          let token = String(data: tokenData, encoding: .utf8) else {
      call.resolve(["status": "error", "message": "missing_token"])
      return
    }
    var fullName: String? = nil
    if let name = credential.fullName {
      fullName = PersonNameComponentsFormatter().string(from: name)
    }
    call.resolve([
      "status": "ok",
      "provider": "apple",
      "identityToken": token,
      "nonce": appleNonce as Any,
      "authorizationCode": credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) } as Any,
      "email": credential.email as Any,
      "fullName": fullName as Any
    ])
  }

  public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
    guard let call = appleCall else { return }
    appleCall = nil
    if (error as NSError).code == ASAuthorizationError.canceled.rawValue {
      call.resolve(["status": "cancelled"])
      return
    }
    call.resolve(["status": "error", "message": error.localizedDescription])
  }

  private func keychainSet(_ key: String, _ value: String) {
    let data = value.data(using: .utf8)!
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key
    ]
    SecItemDelete(query as CFDictionary)
    var add = query
    add[kSecValueData as String] = data
    SecItemAdd(add as CFDictionary, nil)
  }

  private func keychainGet(_ key: String) -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess, let data = item as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  private func keychainDelete(_ key: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key
    ]
    SecItemDelete(query as CFDictionary)
  }

  private func sha256(_ input: String) -> String {
    let digest = SHA256.hash(data: Data(input.utf8))
    return digest.map { String(format: "%02x", $0) }.joined()
  }
}
