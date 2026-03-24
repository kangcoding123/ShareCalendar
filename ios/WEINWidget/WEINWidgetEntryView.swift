import SwiftUI
import WidgetKit

struct WEINWidgetEntryView: View {
    var entry: CalendarEntry
    @Environment(\.widgetFamily) var widgetFamily

    private let calendar = Calendar.current
    private let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ko_KR")
        return f
    }()

    var body: some View {
        if #available(iOSApplicationExtension 17.0, *) {
            mainContent
                .containerBackground(.fill.tertiary, for: .widget)
        } else {
            mainContent
                .padding()
                .background(Color(.systemBackground))
        }
    }

    @ViewBuilder
    private var mainContent: some View {
        switch widgetFamily {
        case .systemSmall:
            smallContent
        case .systemLarge:
            largeContent
        default:
            mediumContent
        }
    }

    // MARK: - Small Widget (오늘 날짜 + 일정 1-2개)

    private var smallContent: some View {
        Link(destination: URL(string: "weincalendar://calendar")!) {
            VStack(alignment: .leading, spacing: 6) {
                // 날짜 헤더
                VStack(alignment: .leading, spacing: 2) {
                    Text(smallDateDayString)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.secondary)
                    Text(smallDateNumberString)
                        .font(.system(size: 24, weight: .bold))
                        .foregroundColor(.primary)
                }

                Divider()

                // 일정 리스트
                let todayEvents = getTodayEvents()
                if todayEvents.isEmpty {
                    Spacer()
                    Text("일정이 없습니다")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity)
                    Spacer()
                } else {
                    let displayEvents = Array(todayEvents.prefix(2))
                    ForEach(displayEvents) { event in
                        smallEventRow(event)
                    }
                    if todayEvents.count > 2 {
                        Text("외 \(todayEvents.count - 2)건")
                            .font(.system(size: 10))
                            .foregroundColor(.secondary)
                    }
                    Spacer(minLength: 0)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .overlay(
                lastUpdatedText
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .padding(.trailing, 12)
                    .padding(.bottom, 6),
                alignment: .bottom
            )
        }
    }

    private func smallEventRow(_ event: WidgetEvent) -> some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(colorFromHex(event.color ?? "#4CAF50"))
                .frame(width: 3, height: 18)

            VStack(alignment: .leading, spacing: 0) {
                Text(event.title)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                if let time = event.time {
                    Text(time)
                        .font(.system(size: 9))
                        .foregroundColor(.secondary)
                }
            }
        }
    }

    // MARK: - Medium Widget (기존: 미니 캘린더 + 일정)

    private var mediumContent: some View {
        HStack(spacing: 0) {
            // LEFT: Mini Calendar
            miniCalendarView
                .frame(maxWidth: .infinity)

            Divider()
                .padding(.vertical, 4)

            // RIGHT: Today's Events
            todayEventsView
                .frame(maxWidth: .infinity)
        }
    }

    // MARK: - Large Widget (풀 캘린더 - 날짜 셀에 일정 표시)

    private var largeContent: some View {
        VStack(spacing: 0) {
            fullCalendarView

            lastUpdatedText
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(.trailing, 12)
                .padding(.bottom, 4)
        }
    }

    // MARK: - Full Calendar (Large용)

    private var fullCalendarView: some View {
        VStack(spacing: 0) {
            // Month header
            Text(largeMonthYearString)
                .font(.system(size: 15, weight: .bold))
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.vertical, 6)

            // Weekday headers
            HStack(spacing: 0) {
                ForEach(["일","월","화","수","목","금","토"], id: \.self) { day in
                    Text(day)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(dayHeaderColor(day))
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.bottom, 3)

            // Date grid with events
            let days = generateFullCalendarDays()
            ForEach(0..<days.count / 7, id: \.self) { week in
                HStack(spacing: 0) {
                    ForEach(0..<7, id: \.self) { weekday in
                        let index = week * 7 + weekday
                        if index < days.count {
                            largeDayCell(days[index], weekday: weekday)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
    }

    private func largeDayCell(_ day: FullDayItem, weekday: Int) -> some View {
        VStack(spacing: 1) {
            // 날짜 번호
            ZStack {
                if day.isToday {
                    Circle()
                        .fill(Color.blue)
                        .frame(width: 20, height: 20)
                }
                Text(day.isVisible ? "\(day.dayNumber)" : "")
                    .font(.system(size: 12, weight: day.isToday ? .bold : .regular))
                    .foregroundColor(day.isToday ? .white : dayColor(weekday: weekday, isCurrentMonth: day.isCurrentMonth, isHoliday: day.isHoliday))
            }
            .frame(height: 20)

            // 일정 텍스트 (최대 2개)
            let maxEvents = 2
            let displayEvents = Array(day.events.prefix(maxEvents))
            ForEach(displayEvents) { event in
                Text(event.title)
                    .font(.system(size: 8, weight: .medium))
                    .foregroundColor(colorFromHex(event.color ?? "#4CAF50"))
                    .lineLimit(1)
                    .frame(maxWidth: .infinity)
                    .frame(height: 11)
            }

            if day.events.count > maxEvents {
                Text("+\(day.events.count - maxEvents)")
                    .font(.system(size: 8))
                    .foregroundColor(.secondary)
                    .frame(height: 11)
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
        .frame(maxHeight: .infinity)
    }

    private var largeMonthYearString: String {
        let year = calendar.component(.year, from: entry.currentMonth)
        let month = calendar.component(.month, from: entry.currentMonth)
        return "\(year)년 \(month)월"
    }

    private func generateFullCalendarDays() -> [FullDayItem] {
        let today = Date()
        let year = calendar.component(.year, from: entry.currentMonth)
        let month = calendar.component(.month, from: entry.currentMonth)
        let todayString = formatDate(today)
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"

        guard let firstOfMonth = calendar.date(from: DateComponents(year: year, month: month, day: 1)),
              let range = calendar.range(of: .day, in: .month, for: firstOfMonth) else {
            return []
        }

        let firstWeekday = calendar.component(.weekday, from: firstOfMonth) - 1

        var days: [FullDayItem] = []

        // Previous month padding
        if firstWeekday > 0 {
            let prevMonth = calendar.date(byAdding: .month, value: -1, to: firstOfMonth)!
            let prevRange = calendar.range(of: .day, in: .month, for: prevMonth)!
            for i in (prevRange.count - firstWeekday + 1)...prevRange.count {
                days.append(FullDayItem(dayNumber: i, isCurrentMonth: false, isToday: false, isHoliday: false, isVisible: true, events: []))
            }
        }

        // Current month
        for day in range {
            let dateString = String(format: "%04d-%02d-%02d", year, month, day)
            let dayEvents = entry.events.filter { event in
                dateString >= event.startDate && dateString <= event.endDate
            }
            days.append(FullDayItem(
                dayNumber: day,
                isCurrentMonth: true,
                isToday: dateString == todayString,
                isHoliday: entry.holidays.contains(dateString),
                isVisible: true,
                events: dayEvents
            ))
        }

        // Next month padding
        let remaining = 7 - (days.count % 7)
        if remaining < 7 {
            for i in 1...remaining {
                days.append(FullDayItem(dayNumber: i, isCurrentMonth: false, isToday: false, isHoliday: false, isVisible: true, events: []))
            }
        }

        return days
    }

    // MARK: - Mini Calendar

    private var miniCalendarView: some View {
        VStack(spacing: 2) {
            // Month header
            Text(monthYearString)
                .font(.system(size: 11, weight: .semibold))
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.bottom, 2)

            // Weekday headers
            HStack(spacing: 0) {
                ForEach(["일","월","화","수","목","금","토"], id: \.self) { day in
                    Text(day)
                        .font(.system(size: 8, weight: .medium))
                        .foregroundColor(dayHeaderColor(day))
                        .frame(maxWidth: .infinity)
                }
            }

            // Date grid
            let days = generateMonthDays()
            ForEach(0..<days.count / 7, id: \.self) { week in
                HStack(spacing: 0) {
                    ForEach(0..<7, id: \.self) { weekday in
                        let index = week * 7 + weekday
                        if index < days.count {
                            dayCell(days[index], weekday: weekday)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
    }

    private func dayCell(_ day: DayItem, weekday: Int) -> some View {
        VStack(spacing: 1) {
            ZStack {
                if day.isToday {
                    Circle()
                        .fill(Color.blue)
                        .frame(width: 18, height: 18)
                }
                Text(day.isVisible ? "\(day.dayNumber)" : "")
                    .font(.system(size: 10, weight: day.isToday ? .bold : .regular))
                    .foregroundColor(day.isToday ? .white : dayColor(weekday: weekday, isCurrentMonth: day.isCurrentMonth, isHoliday: day.isHoliday))
            }
            .frame(height: 18)

            // Event dot
            Circle()
                .fill(day.hasEvent ? Color.orange : Color.clear)
                .frame(width: 3, height: 3)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 22)
    }

    // MARK: - Today's Events

    private var todayEventsView: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Date header + update time
            HStack(spacing: 4) {
                Text(todayDateString)
                    .font(.system(size: 13, weight: .bold))
                Spacer()
                lastUpdatedText
            }
            .padding(.bottom, 2)

            // Event list
            let todayEvents = getTodayEvents()
            if todayEvents.isEmpty {
                Spacer()
                VStack(spacing: 4) {
                    Text("일정이 없습니다")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.secondary)
                    Text("좋은 하루 보내세요!")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity)
                Spacer()
            } else {
                let displayEvents = Array(todayEvents.prefix(4))
                ForEach(displayEvents) { event in
                    Link(destination: URL(string: "weincalendar://event/\(event.id)")!) {
                        eventRow(event)
                    }
                }
                if todayEvents.count > 4 {
                    Text("외 \(todayEvents.count - 4)건")
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                }
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
    }

    private func eventRow(_ event: WidgetEvent) -> some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(colorFromHex(event.color ?? "#4CAF50"))
                .frame(width: 3, height: 20)

            VStack(alignment: .leading, spacing: 1) {
                Text(event.title)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                if let time = event.time {
                    Text(time)
                        .font(.system(size: 9))
                        .foregroundColor(.secondary)
                }
            }
        }
    }

    // MARK: - Helper

    private var monthYearString: String {
        let month = calendar.component(.month, from: entry.currentMonth)
        return "\(month)월"
    }

    private var todayDateString: String {
        dateFormatter.dateFormat = "M월 d일"
        return dateFormatter.string(from: Date())
    }

    private var smallDateDayString: String {
        dateFormatter.dateFormat = "M월 EEEE"
        return dateFormatter.string(from: Date())
    }

    private var smallDateNumberString: String {
        dateFormatter.dateFormat = "d"
        return dateFormatter.string(from: Date())
    }

    private func dayHeaderColor(_ day: String) -> Color {
        switch day {
        case "일": return .red
        case "토": return .blue
        default: return .primary
        }
    }

    private func dayColor(weekday: Int, isCurrentMonth: Bool, isHoliday: Bool = false) -> Color {
        if !isCurrentMonth { return .gray.opacity(0.4) }
        if isHoliday { return .red }
        switch weekday {
        case 0: return .red
        case 6: return .blue
        default: return .primary
        }
    }

    private func getTodayEvents() -> [WidgetEvent] {
        let todayString = formatDate(Date())
        return entry.events.filter { event in
            if event.isMultiDay {
                return event.startDate <= todayString && event.endDate >= todayString
            }
            return event.startDate == todayString
        }
        .sorted { ($0.time ?? "99:99") < ($1.time ?? "99:99") }
    }

    private func formatDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    private func generateMonthDays() -> [DayItem] {
        let today = Date()
        let year = calendar.component(.year, from: entry.currentMonth)
        let month = calendar.component(.month, from: entry.currentMonth)
        let todayString = formatDate(today)

        guard let firstOfMonth = calendar.date(from: DateComponents(year: year, month: month, day: 1)),
              let range = calendar.range(of: .day, in: .month, for: firstOfMonth) else {
            return []
        }

        let firstWeekday = calendar.component(.weekday, from: firstOfMonth) - 1 // 0=Sun

        // Dates with events this month
        let eventDates = Set(entry.events.flatMap { event -> [String] in
            if event.isMultiDay {
                return datesInRange(from: event.startDate, to: event.endDate, year: year, month: month)
            }
            return [event.startDate]
        })

        var days: [DayItem] = []

        // Previous month padding
        if firstWeekday > 0 {
            let prevMonth = calendar.date(byAdding: .month, value: -1, to: firstOfMonth)!
            let prevRange = calendar.range(of: .day, in: .month, for: prevMonth)!
            for i in (prevRange.count - firstWeekday + 1)...prevRange.count {
                days.append(DayItem(dayNumber: i, isCurrentMonth: false, isToday: false, hasEvent: false, isHoliday: false, isVisible: true))
            }
        }

        // Current month
        for day in range {
            let dateString = String(format: "%04d-%02d-%02d", year, month, day)
            days.append(DayItem(
                dayNumber: day,
                isCurrentMonth: true,
                isToday: dateString == todayString,
                hasEvent: eventDates.contains(dateString),
                isHoliday: entry.holidays.contains(dateString),
                isVisible: true
            ))
        }

        // Next month padding
        let remaining = 7 - (days.count % 7)
        if remaining < 7 {
            for i in 1...remaining {
                days.append(DayItem(dayNumber: i, isCurrentMonth: false, isToday: false, hasEvent: false, isHoliday: false, isVisible: true))
            }
        }

        return days
    }

    private func datesInRange(from startStr: String, to endStr: String, year: Int, month: Int) -> [String] {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        guard let start = f.date(from: startStr), let end = f.date(from: endStr) else { return [startStr] }

        var dates: [String] = []
        var current = start
        while current <= end {
            let y = calendar.component(.year, from: current)
            let m = calendar.component(.month, from: current)
            if y == year && m == month {
                dates.append(f.string(from: current))
            }
            guard let next = calendar.date(byAdding: .day, value: 1, to: current) else { break }
            current = next
        }
        return dates
    }

    private var lastUpdatedText: some View {
        Group {
            if let text = formatLastUpdated(entry.lastUpdated) {
                Text(text)
                    .font(.system(size: 9))
                    .foregroundColor(.secondary)
            }
        }
    }

    private func formatLastUpdated(_ isoString: String?) -> String? {
        guard let isoString = isoString else { return nil }
        let isoFormatter = DateFormatter()
        isoFormatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
        isoFormatter.timeZone = TimeZone(identifier: "UTC")
        guard let date = isoFormatter.date(from: isoString) else { return nil }
        let displayFormatter = DateFormatter()
        displayFormatter.locale = Locale(identifier: "ko_KR")
        displayFormatter.dateFormat = "a h:mm 업데이트"
        displayFormatter.timeZone = TimeZone.current
        return displayFormatter.string(from: date)
    }

    private func colorFromHex(_ hex: String) -> Color {
        let cleaned = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard cleaned.count == 6, let rgb = UInt64(cleaned, radix: 16) else {
            return Color.green
        }
        return Color(
            red: Double((rgb >> 16) & 0xFF) / 255.0,
            green: Double((rgb >> 8) & 0xFF) / 255.0,
            blue: Double(rgb & 0xFF) / 255.0
        )
    }
}

struct DayItem {
    let dayNumber: Int
    let isCurrentMonth: Bool
    let isToday: Bool
    let hasEvent: Bool
    let isHoliday: Bool
    let isVisible: Bool
}

struct FullDayItem {
    let dayNumber: Int
    let isCurrentMonth: Bool
    let isToday: Bool
    let isHoliday: Bool
    let isVisible: Bool
    let events: [WidgetEvent]
}

struct WEINWidgetEntryView_Previews: PreviewProvider {
    static var previews: some View {
        let sampleEvents = [
            WidgetEvent(id: "1", title: "팀 미팅", startDate: "2026-03-15", endDate: "2026-03-15", time: "10:00", color: "#4CAF50", groupName: "회사", isMultiDay: false),
            WidgetEvent(id: "2", title: "점심 약속", startDate: "2026-03-15", endDate: "2026-03-15", time: "12:30", color: "#FF9800", groupName: "개인", isMultiDay: false),
            WidgetEvent(id: "3", title: "디자인 리뷰", startDate: "2026-03-15", endDate: "2026-03-15", time: "14:00", color: "#2196F3", groupName: "회사", isMultiDay: false),
        ]
        let entry = CalendarEntry(date: Date(), events: sampleEvents, holidays: ["2026-03-01", "2026-03-02"], currentMonth: Date(), lastUpdated: "2026-03-15T06:45:00.000Z")

        WEINWidgetEntryView(entry: entry)
            .previewContext(WidgetPreviewContext(family: .systemSmall))
            .previewDisplayName("Small")

        WEINWidgetEntryView(entry: entry)
            .previewContext(WidgetPreviewContext(family: .systemMedium))
            .previewDisplayName("Medium")

        WEINWidgetEntryView(entry: entry)
            .previewContext(WidgetPreviewContext(family: .systemLarge))
            .previewDisplayName("Large")
    }
}
