package com.kangcoding.sharecalendar.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import com.kangcoding.sharecalendar.R
import com.kangcoding.sharecalendar.SharedDataModule
import org.json.JSONObject
import org.json.JSONArray
import java.text.SimpleDateFormat
import java.util.*

open class CalendarWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onAppWidgetOptionsChanged(
        context: Context, appWidgetManager: AppWidgetManager,
        appWidgetId: Int, newOptions: Bundle
    ) {
        updateWidget(context, appWidgetManager, appWidgetId)
    }

    private fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
        val options = appWidgetManager.getAppWidgetOptions(appWidgetId)
        val minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 110)
        val minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110)
        Log.d("CalendarWidget", "Widget size: minWidth=$minWidth, minHeight=$minHeight")

        val data = loadWidgetData(context)
        val theme = WidgetConfigActivity.getTheme(context, appWidgetId)
        val opacity = WidgetConfigActivity.getOpacity(context, appWidgetId)
        val isDark = theme == "dark"

        val views = when {
            minWidth >= 250 && minHeight >= 300 -> {
                Log.d("CalendarWidget", "Layout: Large")
                buildLargeWidget(context, data, minHeight, isDark)
            }
            minWidth >= 250 -> {
                Log.d("CalendarWidget", "Layout: Medium")
                buildMediumWidget(context, data, minHeight, isDark)
            }
            else -> {
                Log.d("CalendarWidget", "Layout: Small")
                buildSmallWidget(context, data, minHeight, isDark)
            }
        }

        // 배경색 + 투명도 적용
        val alpha = (opacity * 255 / 100)
        val bgColor = if (isDark) Color.argb(alpha, 26, 26, 26) else Color.argb(alpha, 255, 255, 255)
        val rootId = when {
            minWidth >= 250 && minHeight >= 300 -> R.id.widget_large_root
            minWidth >= 250 -> R.id.widget_medium_root
            else -> R.id.widget_small_root
        }
        views.setInt(rootId, "setBackgroundColor", bgColor)

        // 테마 텍스트색 적용
        applyThemeColors(views, rootId, isDark)

        appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    private fun applyThemeColors(views: RemoteViews, rootId: Int, isDark: Boolean) {
        val textPrimary = if (isDark) Color.WHITE else Color.parseColor("#1A1A1A")
        val textSecondary = if (isDark) Color.parseColor("#AAAAAA") else Color.parseColor("#666666")
        val textTertiary = if (isDark) Color.parseColor("#777777") else Color.parseColor("#999999")
        val textUpdated = if (isDark) Color.parseColor("#777777") else Color.parseColor("#888888")

        when (rootId) {
            R.id.widget_small_root -> {
                views.setTextColor(R.id.tv_date_month, textSecondary)
                views.setTextColor(R.id.tv_date_day, textPrimary)
                views.setTextColor(R.id.tv_date_weekday, textSecondary)
                views.setTextColor(R.id.tv_no_events, textTertiary)
                views.setTextColor(R.id.tv_last_updated, textUpdated)
            }
            R.id.widget_medium_root -> {
                views.setTextColor(R.id.tv_month_title, textPrimary)
                views.setTextColor(R.id.tv_today_header, textPrimary)
                views.setTextColor(R.id.tv_no_events, textTertiary)
                views.setTextColor(R.id.tv_last_updated, textUpdated)
            }
            R.id.widget_large_root -> {
                views.setTextColor(R.id.tv_month_title, textPrimary)
                views.setTextColor(R.id.tv_last_updated, textUpdated)
            }
        }
    }

    private fun loadWidgetData(context: Context): WidgetData {
        val prefs = context.getSharedPreferences(SharedDataModule.PREFS_NAME, Context.MODE_PRIVATE)
        val jsonString = prefs.getString(SharedDataModule.WIDGET_DATA_KEY, null) ?: return WidgetData.empty()

        return try {
            val json = JSONObject(jsonString)
            val today = json.optString("today", "")
            val eventsArray = json.optJSONArray("events") ?: JSONArray()
            val holidaysArray = json.optJSONArray("holidays") ?: JSONArray()

            val events = mutableListOf<WidgetEvent>()
            for (i in 0 until eventsArray.length()) {
                val e = eventsArray.getJSONObject(i)
                events.add(WidgetEvent(
                    id = e.optString("id", ""),
                    title = e.optString("title", ""),
                    startDate = e.optString("startDate", ""),
                    endDate = e.optString("endDate", ""),
                    time = if (e.isNull("time")) null else e.optString("time", ""),
                    color = if (e.isNull("color")) null else e.optString("color", ""),
                    groupName = if (e.isNull("groupName")) null else e.optString("groupName", ""),
                    isMultiDay = e.optBoolean("isMultiDay", false)
                ))
            }

            val holidays = mutableSetOf<String>()
            for (i in 0 until holidaysArray.length()) {
                holidays.add(holidaysArray.getString(i))
            }

            val lastUpdated = json.optString("lastUpdated", null)

            WidgetData(today, events, holidays, lastUpdated)
        } catch (e: Exception) {
            WidgetData.empty()
        }
    }

    // ==================== Small Widget ====================
    private fun buildSmallWidget(context: Context, data: WidgetData, minHeight: Int, isDark: Boolean = false): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_small)

        val cal = Calendar.getInstance()
        val today = data.today

        // 날짜 표시
        val monthFormat = SimpleDateFormat("M월", Locale.KOREAN)
        val dayFormat = SimpleDateFormat("d", Locale.KOREAN)
        val weekdayFormat = SimpleDateFormat("EEEE", Locale.KOREAN)

        views.setTextViewText(R.id.tv_date_month, monthFormat.format(cal.time))
        views.setTextViewText(R.id.tv_date_day, dayFormat.format(cal.time))
        views.setTextViewText(R.id.tv_date_weekday, weekdayFormat.format(cal.time))

        // 높이에 따라 표시 일정 개수 계산
        // Small 헤더 ≈ 105dp, 일정 행 ≈ 36dp
        val availableHeight = minHeight - 105
        val maxEvents = (availableHeight / 36).coerceAtLeast(1)

        // 오늘 일정 필터링
        val allTodayEvents = data.events.filter { event ->
            today >= event.startDate && today <= event.endDate
        }
        val showCount = if (allTodayEvents.size > maxEvents && maxEvents > 1) maxEvents - 1 else minOf(allTodayEvents.size, maxEvents)
        val todayEvents = allTodayEvents.take(showCount)
        val moreCount = allTodayEvents.size - showCount
        Log.d("CalendarWidget", "Small: total=${allTodayEvents.size} maxEvents=$maxEvents showCount=$showCount moreCount=$moreCount minHeight=$minHeight")

        val eventContainer = R.id.event_container
        views.removeAllViews(eventContainer)

        if (todayEvents.isEmpty()) {
            views.setViewVisibility(R.id.tv_no_events, View.VISIBLE)
            views.setViewVisibility(eventContainer, View.GONE)
        } else {
            views.setViewVisibility(R.id.tv_no_events, View.GONE)
            views.setViewVisibility(eventContainer, View.VISIBLE)
            for (event in todayEvents) {
                val eventView = createEventRow(context, event, showGroup = false, isDark = isDark)
                views.addView(eventContainer, eventView)
            }
            if (moreCount > 0) {
                val moreView = createMoreRow(context, moreCount, isDark = isDark)
                views.addView(eventContainer, moreView)
            }
        }

        // 마지막 업데이트 시간
        setLastUpdatedText(views, data.lastUpdated)

        // 위젯 전체 클릭 → 앱 열기
        setWidgetClickIntent(context, views, R.id.widget_small_root)

        return views
    }

    // ==================== Medium Widget ====================
    private fun buildMediumWidget(context: Context, data: WidgetData, minHeight: Int, isDark: Boolean = false): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_medium)

        val cal = Calendar.getInstance()
        val today = data.today

        // 월 헤더
        val monthFormat = SimpleDateFormat("M월", Locale.KOREAN)
        views.setTextViewText(R.id.tv_month_title, monthFormat.format(cal.time))

        // 미니 캘린더 구성
        buildMiniCalendar(context, views, cal, data, R.id.weekday_header, R.id.calendar_grid, isDark)

        // 오늘 일정
        val todayDateFormat = SimpleDateFormat("M월 d일", Locale.KOREAN)
        views.setTextViewText(R.id.tv_today_header, todayDateFormat.format(cal.time))

        val allTodayEvents = data.events.filter { event ->
            today >= event.startDate && today <= event.endDate
        }
        // Medium 오른쪽 일정 영역: 헤더(~40dp) + padding(24dp), 일정 행 ≈ 36dp
        val availableHeight = minHeight - 64
        val maxEvents = (availableHeight / 36).coerceAtLeast(1)
        val showCount = if (allTodayEvents.size > maxEvents && maxEvents > 1) maxEvents - 1 else minOf(allTodayEvents.size, maxEvents)
        val todayEvents = allTodayEvents.take(showCount)
        val moreCount = allTodayEvents.size - showCount
        Log.d("CalendarWidget", "Medium: total=${allTodayEvents.size} maxEvents=$maxEvents showCount=$showCount moreCount=$moreCount minHeight=$minHeight")

        val eventContainer = R.id.event_container
        views.removeAllViews(eventContainer)

        if (todayEvents.isEmpty()) {
            views.setViewVisibility(R.id.tv_no_events, View.VISIBLE)
            views.setViewVisibility(eventContainer, View.GONE)
        } else {
            views.setViewVisibility(R.id.tv_no_events, View.GONE)
            views.setViewVisibility(eventContainer, View.VISIBLE)
            for (event in todayEvents) {
                val eventView = createEventRow(context, event, showGroup = false, isDark = isDark)
                views.addView(eventContainer, eventView)
            }
            if (moreCount > 0) {
                val moreView = createMoreRow(context, moreCount, isDark = isDark)
                views.addView(eventContainer, moreView)
            }
        }

        // 마지막 업데이트 시간
        setLastUpdatedText(views, data.lastUpdated)

        setWidgetClickIntent(context, views, R.id.widget_medium_root)

        return views
    }

    // ==================== Large Widget ====================
    private fun buildLargeWidget(context: Context, data: WidgetData, minHeight: Int, isDark: Boolean = false): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_large)

        val cal = Calendar.getInstance()

        // 월 헤더
        val monthFormat = SimpleDateFormat("yyyy년 M월", Locale.KOREAN)
        views.setTextViewText(R.id.tv_month_title, monthFormat.format(cal.time))

        // 높이에 따라 셀당 일정 표시 개수 계산
        // 헤더(월 제목 + 요일) ≈ 40dp, padding 24dp, 6주 행으로 나눔
        // 셀 내: 날짜(22dp), 일정 텍스트(~12dp)
        val calendarHeight = minHeight - 64 // 헤더 + padding
        val weekCount = 6
        val cellHeight = calendarHeight / weekCount
        val eventSlotHeight = 12 // 9sp 텍스트 + margin
        val dateHeight = 22
        val availableCellHeight = cellHeight - dateHeight
        val maxEventsPerCell = (availableCellHeight / eventSlotHeight).coerceIn(1, 5)
        Log.d("CalendarWidget", "maxEventsPerCell=$maxEventsPerCell (minHeight=$minHeight)")

        // 날짜 셀 안에 일정이 표시되는 풀 캘린더 구성
        buildFullCalendar(context, views, cal, data, R.id.weekday_header, R.id.calendar_grid, maxEventsPerCell, isDark)

        // 마지막 업데이트 시간
        setLastUpdatedText(views, data.lastUpdated)

        setWidgetClickIntent(context, views, R.id.widget_large_root)

        return views
    }

    // ==================== 풀 캘린더 (Large용, 날짜 셀에 일정 표시) ====================
    private fun buildFullCalendar(
        context: Context, views: RemoteViews, cal: Calendar,
        data: WidgetData, weekdayHeaderId: Int, calendarGridId: Int, maxEventsPerCell: Int,
        isDark: Boolean = false
    ) {
        views.removeAllViews(weekdayHeaderId)
        views.removeAllViews(calendarGridId)

        val weekdays = arrayOf("일", "월", "화", "수", "목", "금", "토")
        val defaultTextColor = if (isDark) Color.parseColor("#DDDDDD") else Color.parseColor("#333333")

        // 요일 헤더
        for ((index, day) in weekdays.withIndex()) {
            val headerCell = createCalendarCell(context, day, textSize = 11f, textColor = when (index) {
                0 -> Color.parseColor("#D32F2F")
                6 -> Color.parseColor("#1565C0")
                else -> defaultTextColor
            }, isBold = true)
            views.addView(weekdayHeaderId, headerCell)
        }

        // 이번 달 계산
        val currentDay = cal.get(Calendar.DAY_OF_MONTH)
        val tempCal = cal.clone() as Calendar
        tempCal.set(Calendar.DAY_OF_MONTH, 1)
        val firstDayOfWeek = tempCal.get(Calendar.DAY_OF_WEEK) - 1
        val maxDay = tempCal.getActualMaximum(Calendar.DAY_OF_MONTH)

        val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)

        var dayCounter = 1
        for (week in 0 until 6) {
            val rowView = createCalendarRow(context)
            for (col in 0 until 7) {
                val cellIndex = week * 7 + col
                if (cellIndex < firstDayOfWeek || dayCounter > maxDay) {
                    val emptyCell = createLargeCalendarCell(context, "", Color.TRANSPARENT, isToday = false, events = emptyList(), moreCount = 0)
                    rowView.addView(R.id.calendar_row, emptyCell)
                } else {
                    val dayNum = dayCounter
                    tempCal.set(Calendar.DAY_OF_MONTH, dayNum)
                    val dateStr = dateFormat.format(tempCal.time)
                    val isHoliday = data.holidays.contains(dateStr)
                    val isToday = dayNum == currentDay

                    val textColor = when {
                        isToday -> Color.WHITE
                        isHoliday || col == 0 -> Color.parseColor("#F44336")
                        col == 6 -> Color.parseColor("#2196F3")
                        else -> if (isDark) Color.WHITE else Color.parseColor("#1A1A1A")
                    }

                    // 이 날짜의 일정들
                    val allDayEvents = data.events.filter { dateStr >= it.startDate && dateStr <= it.endDate }
                    val showCount = if (allDayEvents.size > maxEventsPerCell) maxEventsPerCell - 1 else allDayEvents.size
                    val dayEvents = allDayEvents.take(showCount)
                    val moreCount = allDayEvents.size - showCount

                    val cell = createLargeCalendarCell(context, dayNum.toString(), textColor, isToday, dayEvents, moreCount)
                    rowView.addView(R.id.calendar_row, cell)
                    dayCounter++
                }
            }
            views.addView(calendarGridId, rowView)
            if (dayCounter > maxDay) break
        }
    }

    private fun createLargeCalendarCell(
        context: Context, text: String, textColor: Int,
        isToday: Boolean, events: List<WidgetEvent>, moreCount: Int
    ): RemoteViews {
        val cell = RemoteViews(context.packageName, R.layout.widget_calendar_cell_large)
        cell.setTextViewText(R.id.tv_day, text)
        cell.setTextColor(R.id.tv_day, textColor)

        if (isToday) {
            cell.setViewVisibility(R.id.today_bg, View.VISIBLE)
        } else {
            cell.setViewVisibility(R.id.today_bg, View.GONE)
        }

        // 일정 표시 (최대 5개)
        val eventViewIds = intArrayOf(R.id.tv_event1, R.id.tv_event2, R.id.tv_event3, R.id.tv_event4, R.id.tv_event5)
        for (i in events.indices) {
            if (i >= eventViewIds.size) break
            val event = events[i]
            val color = try { Color.parseColor(event.color ?: "#4CAF50") } catch (e: Exception) { Color.parseColor("#4CAF50") }
            cell.setTextViewText(eventViewIds[i], event.title)
            cell.setTextColor(eventViewIds[i], color)
            cell.setViewVisibility(eventViewIds[i], View.VISIBLE)
        }

        // "+N" 표시 (남는 슬롯 하나를 활용)
        if (moreCount > 0 && events.size < eventViewIds.size) {
            val moreSlot = eventViewIds[events.size]
            cell.setTextViewText(moreSlot, "+$moreCount")
            cell.setTextColor(moreSlot, Color.parseColor("#999999"))
            cell.setViewVisibility(moreSlot, View.VISIBLE)
        }

        return cell
    }

    private fun createMoreRow(context: Context, moreCount: Int, isDark: Boolean = false): RemoteViews {
        val row = RemoteViews(context.packageName, R.layout.widget_event_row)
        row.setViewVisibility(R.id.event_color_bar, View.GONE)
        row.setTextViewText(R.id.tv_event_title, "+${moreCount}개 더보기")
        row.setTextColor(R.id.tv_event_title, if (isDark) Color.parseColor("#AAAAAA") else Color.parseColor("#999999"))
        row.setViewVisibility(R.id.tv_event_time, View.GONE)
        row.setViewVisibility(R.id.tv_event_group, View.GONE)
        return row
    }

    // ==================== 미니 캘린더 ====================
    private fun buildMiniCalendar(
        context: Context, views: RemoteViews, cal: Calendar,
        data: WidgetData, weekdayHeaderId: Int, calendarGridId: Int,
        isDark: Boolean = false
    ) {
        views.removeAllViews(weekdayHeaderId)
        views.removeAllViews(calendarGridId)

        val weekdays = arrayOf("일", "월", "화", "수", "목", "금", "토")
        val defaultTextColor = if (isDark) Color.parseColor("#DDDDDD") else Color.parseColor("#333333")

        // 요일 헤더
        for ((index, day) in weekdays.withIndex()) {
            val headerCell = createCalendarCell(context, day, textSize = 11f, textColor = when (index) {
                0 -> Color.parseColor("#D32F2F")
                6 -> Color.parseColor("#1565C0")
                else -> defaultTextColor
            }, isBold = true)
            views.addView(weekdayHeaderId, headerCell)
        }

        // 이번 달 1일과 마지막 날 계산
        val currentDay = cal.get(Calendar.DAY_OF_MONTH)
        val tempCal = cal.clone() as Calendar
        tempCal.set(Calendar.DAY_OF_MONTH, 1)
        val firstDayOfWeek = tempCal.get(Calendar.DAY_OF_WEEK) - 1
        val maxDay = tempCal.getActualMaximum(Calendar.DAY_OF_MONTH)

        val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)

        var dayCounter = 1
        for (week in 0 until 6) {
            val rowView = createCalendarRow(context)
            for (col in 0 until 7) {
                val cellIndex = week * 7 + col
                if (cellIndex < firstDayOfWeek || dayCounter > maxDay) {
                    val emptyCell = createCalendarCell(context, "", textSize = 14f, textColor = Color.TRANSPARENT)
                    rowView.addView(R.id.calendar_row, emptyCell)
                } else {
                    val dayNum = dayCounter
                    tempCal.set(Calendar.DAY_OF_MONTH, dayNum)
                    val dateStr = dateFormat.format(tempCal.time)
                    val isHoliday = data.holidays.contains(dateStr)
                    val isToday = dayNum == currentDay
                    val hasEvent = data.events.any { dateStr >= it.startDate && dateStr <= it.endDate }

                    val textColor = when {
                        isToday -> Color.WHITE
                        isHoliday || col == 0 -> Color.parseColor("#F44336")
                        col == 6 -> Color.parseColor("#2196F3")
                        else -> if (isDark) Color.WHITE else Color.parseColor("#1A1A1A")
                    }

                    val cell = createCalendarCell(
                        context, dayNum.toString(), textSize = 14f,
                        textColor = textColor, isToday = isToday, hasEvent = hasEvent,
                        isBold = true
                    )
                    rowView.addView(R.id.calendar_row, cell)
                    dayCounter++
                }
            }
            views.addView(calendarGridId, rowView)
            if (dayCounter > maxDay) break
        }
    }

    private fun createCalendarRow(context: Context): RemoteViews {
        return RemoteViews(context.packageName, R.layout.widget_calendar_row)
    }

    private fun createCalendarCell(
        context: Context, text: String, textSize: Float,
        textColor: Int, isToday: Boolean = false, hasEvent: Boolean = false,
        isBold: Boolean = false
    ): RemoteViews {
        val cell = RemoteViews(context.packageName, R.layout.widget_calendar_cell)
        if (isBold) {
            val spannable = android.text.SpannableString(text)
            spannable.setSpan(android.text.style.StyleSpan(android.graphics.Typeface.BOLD), 0, text.length, 0)
            cell.setTextViewText(R.id.tv_day, spannable)
        } else {
            cell.setTextViewText(R.id.tv_day, text)
        }
        cell.setTextColor(R.id.tv_day, textColor)

        if (isToday) {
            cell.setViewVisibility(R.id.today_bg, View.VISIBLE)
        } else {
            cell.setViewVisibility(R.id.today_bg, View.GONE)
        }

        if (hasEvent && !isToday) {
            cell.setViewVisibility(R.id.event_dot, View.VISIBLE)
        } else {
            cell.setViewVisibility(R.id.event_dot, View.GONE)
        }

        return cell
    }

    // ==================== 일정 행 ====================
    private fun createEventRow(context: Context, event: WidgetEvent, showGroup: Boolean, isDark: Boolean = false): RemoteViews {
        val row = RemoteViews(context.packageName, R.layout.widget_event_row)

        // 색상 바
        val color = try {
            Color.parseColor(event.color ?: "#4CAF50")
        } catch (e: Exception) {
            Color.parseColor("#4CAF50")
        }
        row.setInt(R.id.event_color_bar, "setBackgroundColor", color)

        // 제목
        row.setTextViewText(R.id.tv_event_title, event.title)
        if (isDark) {
            row.setTextColor(R.id.tv_event_title, Color.WHITE)
        }

        // 시간
        if (event.time != null) {
            row.setTextViewText(R.id.tv_event_time, event.time)
            row.setViewVisibility(R.id.tv_event_time, View.VISIBLE)
        } else {
            row.setTextViewText(R.id.tv_event_time, "종일")
            row.setViewVisibility(R.id.tv_event_time, View.VISIBLE)
        }
        if (isDark) {
            row.setTextColor(R.id.tv_event_time, Color.parseColor("#AAAAAA"))
        }

        // 그룹명 (Large에서만)
        if (showGroup && event.groupName != null) {
            row.setTextViewText(R.id.tv_event_group, event.groupName)
            row.setViewVisibility(R.id.tv_event_group, View.VISIBLE)
            if (isDark) {
                row.setTextColor(R.id.tv_event_group, Color.parseColor("#888888"))
            }
        } else {
            row.setViewVisibility(R.id.tv_event_group, View.GONE)
        }

        return row
    }

    private fun formatLastUpdated(isoString: String?): String {
        if (isoString == null) return ""
        return try {
            val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
            isoFormat.timeZone = TimeZone.getTimeZone("UTC")
            val date = isoFormat.parse(isoString) ?: return ""
            val displayFormat = SimpleDateFormat("a h:mm 업데이트", Locale.KOREAN)
            displayFormat.timeZone = TimeZone.getDefault()
            displayFormat.format(date)
        } catch (e: Exception) {
            ""
        }
    }

    private fun setLastUpdatedText(views: RemoteViews, lastUpdated: String?) {
        Log.d("CalendarWidget", "lastUpdated raw: '$lastUpdated'")
        val text = formatLastUpdated(lastUpdated)
        Log.d("CalendarWidget", "lastUpdated formatted: '$text'")
        if (text.isNotEmpty()) {
            views.setTextViewText(R.id.tv_last_updated, text)
            views.setViewVisibility(R.id.tv_last_updated, View.VISIBLE)
        } else {
            views.setViewVisibility(R.id.tv_last_updated, View.GONE)
        }
    }

    private fun setWidgetClickIntent(context: Context, views: RemoteViews, rootViewId: Int) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("weincalendar://calendar"))
        val pendingIntent = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(rootViewId, pendingIntent)
    }
}

// ==================== 데이터 모델 ====================
data class WidgetEvent(
    val id: String,
    val title: String,
    val startDate: String,
    val endDate: String,
    val time: String?,
    val color: String?,
    val groupName: String?,
    val isMultiDay: Boolean
)

data class WidgetData(
    val today: String,
    val events: List<WidgetEvent>,
    val holidays: Set<String>,
    val lastUpdated: String? = null
) {
    companion object {
        fun empty(): WidgetData = WidgetData(
            today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date()),
            events = emptyList(),
            holidays = emptySet(),
            lastUpdated = null
        )
    }
}
