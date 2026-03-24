import WidgetKit
import SwiftUI

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> CalendarEntry {
        CalendarEntry(date: Date(), events: [], holidays: [], currentMonth: Date(), lastUpdated: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (CalendarEntry) -> Void) {
        let entry = loadEntry()
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CalendarEntry>) -> Void) {
        let entry = loadEntry()

        // 15분마다 타임라인 갱신 (UserDefaults에서 최신 데이터 다시 읽기)
        let refreshDate = Date().addingTimeInterval(15 * 60)
        let timeline = Timeline(entries: [entry], policy: .after(refreshDate))
        completion(timeline)
    }

    private func loadEntry() -> CalendarEntry {
        guard let sharedDefaults = UserDefaults(suiteName: WidgetConstants.appGroupId),
              let jsonString = sharedDefaults.string(forKey: WidgetConstants.widgetDataKey),
              let data = jsonString.data(using: .utf8),
              let widgetData = try? JSONDecoder().decode(WidgetCalendarData.self, from: data) else {
            return CalendarEntry(date: Date(), events: [], holidays: [], currentMonth: Date(), lastUpdated: nil)
        }

        let holidaySet = Set(widgetData.holidays ?? [])
        return CalendarEntry(
            date: Date(),
            events: widgetData.events,
            holidays: holidaySet,
            currentMonth: Date(),
            lastUpdated: widgetData.lastUpdated
        )
    }
}

struct CalendarEntry: TimelineEntry {
    let date: Date
    let events: [WidgetEvent]
    let holidays: Set<String>
    let currentMonth: Date
    let lastUpdated: String?
}

struct WEINWidget: Widget {
    let kind: String = "WEINCalendarWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            if #available(iOS 17.0, *) {
                WEINWidgetEntryView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                WEINWidgetEntryView(entry: entry)
                    .padding()
                    .background(Color(.systemBackground))
            }
        }
        .configurationDisplayName("WE:IN 캘린더")
        .description("오늘의 일정을 한눈에 확인하세요")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
