import Foundation

struct WidgetCalendarData: Codable {
    let today: String              // "YYYY-MM-DD"
    let events: [WidgetEvent]
    let holidays: [String]?        // 공휴일 날짜 목록 ["YYYY-MM-DD", ...]
    let lastUpdated: String        // ISO 8601
}

struct WidgetEvent: Codable, Identifiable {
    let id: String
    let title: String
    let startDate: String          // "YYYY-MM-DD"
    let endDate: String            // "YYYY-MM-DD"
    let time: String?              // "HH:MM" or nil
    let color: String?             // hex color e.g. "#4CAF50"
    let groupName: String?
    let isMultiDay: Bool
}

enum WidgetConstants {
    static let appGroupId = "group.com.kangcoding.sharecalendar"
    static let widgetDataKey = "widgetCalendarData"
}
