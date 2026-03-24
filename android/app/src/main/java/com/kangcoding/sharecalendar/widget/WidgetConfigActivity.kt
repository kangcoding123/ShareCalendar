package com.kangcoding.sharecalendar.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.SeekBar
import android.widget.TextView
import com.kangcoding.sharecalendar.R

class WidgetConfigActivity : Activity() {

    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID
    private var selectedTheme = "light"
    private var opacity = 100

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setResult(RESULT_CANCELED)

        appWidgetId = intent?.extras?.getInt(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID

        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }

        setContentView(R.layout.activity_widget_config)

        loadSettings()
        updateColorSelection()
        updatePreview()

        // 라이트 옵션 (전체 영역 클릭)
        findViewById<View>(R.id.option_light).setOnClickListener {
            selectedTheme = "light"
            updateColorSelection()
            updatePreview()
        }
        // 다크 옵션 (전체 영역 클릭)
        findViewById<View>(R.id.option_dark).setOnClickListener {
            selectedTheme = "dark"
            updateColorSelection()
            updatePreview()
        }

        val seekBar = findViewById<SeekBar>(R.id.seekbar_opacity)
        val tvOpacity = findViewById<TextView>(R.id.tv_opacity_value)
        seekBar.progress = opacity
        tvOpacity.text = "${opacity}%"

        seekBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar?, progress: Int, fromUser: Boolean) {
                opacity = progress
                tvOpacity.text = "${progress}%"
                updatePreview()
            }
            override fun onStartTrackingTouch(sb: SeekBar?) {}
            override fun onStopTrackingTouch(sb: SeekBar?) {}
        })

        findViewById<Button>(R.id.btn_apply).setOnClickListener {
            saveSettings()
            updateWidgetAndFinish()
        }
    }

    private fun loadSettings() {
        val prefs = getSharedPreferences(WIDGET_CONFIG_PREFS, Context.MODE_PRIVATE)
        selectedTheme = prefs.getString("widget_theme_$appWidgetId", "light") ?: "light"
        opacity = prefs.getInt("widget_opacity_$appWidgetId", 100)
    }

    private fun saveSettings() {
        val prefs = getSharedPreferences(WIDGET_CONFIG_PREFS, Context.MODE_PRIVATE)
        prefs.edit()
            .putString("widget_theme_$appWidgetId", selectedTheme)
            .putInt("widget_opacity_$appWidgetId", opacity)
            .apply()
    }

    private fun updateColorSelection() {
        findViewById<View>(R.id.border_white).visibility =
            if (selectedTheme == "light") View.VISIBLE else View.GONE
        findViewById<View>(R.id.border_black).visibility =
            if (selectedTheme == "dark") View.VISIBLE else View.GONE
    }

    private fun updatePreview() {
        val preview = findViewById<View>(R.id.preview_widget)
        val alpha = (opacity * 255 / 100)

        val bgColor = if (selectedTheme == "dark") Color.argb(alpha, 26, 26, 26) else Color.argb(alpha, 255, 255, 255)
        val textPrimary = if (selectedTheme == "dark") Color.WHITE else Color.parseColor("#1A1A1A")
        val textSecondary = if (selectedTheme == "dark") Color.parseColor("#AAAAAA") else Color.parseColor("#666666")

        val bg = GradientDrawable()
        bg.shape = GradientDrawable.RECTANGLE
        bg.cornerRadius = 16f * resources.displayMetrics.density
        bg.setColor(bgColor)
        preview.background = bg

        findViewById<TextView>(R.id.preview_text1).setTextColor(textSecondary)
        findViewById<TextView>(R.id.preview_text2).setTextColor(textPrimary)
        findViewById<TextView>(R.id.preview_text3).setTextColor(textSecondary)
    }

    private fun updateWidgetAndFinish() {
        val appWidgetManager = AppWidgetManager.getInstance(this)
        val provider = CalendarWidgetProvider()
        provider.onUpdate(this, appWidgetManager, intArrayOf(appWidgetId))

        val resultValue = Intent()
        resultValue.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        setResult(RESULT_OK, resultValue)
        finish()
    }

    companion object {
        const val WIDGET_CONFIG_PREFS = "widget_config"

        fun getTheme(context: Context, appWidgetId: Int): String {
            val prefs = context.getSharedPreferences(WIDGET_CONFIG_PREFS, Context.MODE_PRIVATE)
            return prefs.getString("widget_theme_$appWidgetId", "light") ?: "light"
        }

        fun getOpacity(context: Context, appWidgetId: Int): Int {
            val prefs = context.getSharedPreferences(WIDGET_CONFIG_PREFS, Context.MODE_PRIVATE)
            return prefs.getInt("widget_opacity_$appWidgetId", 100)
        }
    }
}
