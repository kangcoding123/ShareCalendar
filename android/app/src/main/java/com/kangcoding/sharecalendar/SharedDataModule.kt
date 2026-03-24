package com.kangcoding.sharecalendar

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.kangcoding.sharecalendar.widget.CalendarWidgetProvider
import com.kangcoding.sharecalendar.widget.CalendarWidgetProviderMedium
import com.kangcoding.sharecalendar.widget.CalendarWidgetProviderLarge

class SharedDataModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SharedDataModule"

    @ReactMethod
    fun updateWidgetData(jsonString: String) {
        val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(WIDGET_DATA_KEY, jsonString).apply()
        reloadWidgets()
    }

    @ReactMethod
    fun reloadWidget() {
        reloadWidgets()
    }

    private fun reloadWidgets() {
        val context = reactApplicationContext
        val appWidgetManager = AppWidgetManager.getInstance(context)

        val providers = listOf(
            CalendarWidgetProvider::class.java,
            CalendarWidgetProviderMedium::class.java,
            CalendarWidgetProviderLarge::class.java
        )
        for (cls in providers) {
            val ids = appWidgetManager.getAppWidgetIds(ComponentName(context, cls))
            if (ids.isNotEmpty()) {
                val provider = cls.getDeclaredConstructor().newInstance()
                provider.onUpdate(context, appWidgetManager, ids)
            }
        }
    }

    companion object {
        const val PREFS_NAME = "widget_shared_data"
        const val WIDGET_DATA_KEY = "widgetCalendarData"
    }
}
