#!/usr/bin/env python3
"""
Build a curated catalog of commonly used sensors and related module documents.

The output includes:
- `sensors`: one row per curated canonical sensor/module
- `rows`: flattened document rows suitable for `download_document_catalog.py`
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import time
from collections import Counter, defaultdict


ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_MODULE_DOCS = ROOT / "downloads" / "module-vendor-sensor-docs.fast.json"
DEFAULT_OFFICIAL_CANDIDATES = ROOT / "downloads" / "popular-sensor-datasheet-candidates.raw.json"
DEFAULT_OUTPUT = ROOT / "downloads" / "popular-sensor-200.json"
DEFAULT_EXTRA_CATALOGS = [
    ROOT / "downloads" / "adafruit-sensor-docs.json",
    ROOT / "downloads" / "module-vendor-sensor-docs-sparkfun.json",
    ROOT / "downloads" / "module-vendor-sensor-docs-seeed-keyestudio.json",
    ROOT / "downloads" / "module-vendor-sensor-docs-dfrobot-fast.json",
]

MODULE_VENDOR_HOSTS = {
    "adafruit.com",
    "cdn-learn.adafruit.com",
    "learn.adafruit.com",
    "www.adafruit.com",
    "sparkfun.com",
    "www.sparkfun.com",
    "learn.sparkfun.com",
    "wiki.seeedstudio.com",
    "wiki.dfrobot.com",
    "wiki.keyestudio.com",
}

SENSOR_CATEGORY_PREFIXES = {
    "temperature_humidity",
    "pressure",
    "light",
    "proximity",
    "motion",
    "gas",
    "sound",
    "biometric",
    "weight",
    "touch",
    "magnetic",
    "location",
    "flow",
    "force",
    "vibration",
    "moisture",
    "water",
    "sensor",
    "position",
}

MANUAL_OVERRIDES = {
    "INA219": {
        "officialDatasheetUrl": "https://www.ti.com/lit/ds/symlink/ina219.pdf",
    },
    "INA226": {
        "officialDatasheetUrl": "https://www.ti.com/product/INA226",
    },
    "SSD1306": {
        "officialDatasheetUrl": "https://www.solomon-systech.com/product/ssd1306",
    },
    "DS3231": {
        "officialDatasheetUrl": "https://www.analog.com/media/en/technical-documentation/data-sheets/ds3231.pdf",
    },
    "DS1307": {
        "officialDatasheetUrl": "https://www.analog.com/media/en/technical-documentation/data-sheets/ds1307.pdf",
    },
    "MCP3008": {
        "officialDatasheetUrl": "https://www.microchip.com/en-us/product/mcp3008",
    },
    "PCA9685": {
        "officialDatasheetUrl": "https://www.nxp.com/products/power-drivers/lighting-driver-and-controller-ics/led-drivers/16-channel-12-bit-pwm-fm-plus-ic-bus-led-driver%3APCA9685",
    },
    "NRF24L01": {
        "officialDatasheetUrl": "https://www.nordicsemi.com/Products/nRF24-series",
    },
    "ESP-01": {
        "officialDatasheetUrl": "https://www.espressif.com/en/products/socs/esp8266ex",
    },
    "NEO-6M": {
        "officialDatasheetUrl": "https://www.u-blox.com/en/product/neo-6-series",
    },
    "NEO-M8N": {
        "officialDatasheetUrl": "https://www.u-blox.com/en/product/neo-m8-series",
    },
    "PN532": {
        "officialDatasheetUrl": "https://www.nxp.com/products/rfid-nfc/nfc-hf/nfc-readers/standard-performance-mifare-and-nfc-frontend:PN532",
    },
    "MFRC522": {
        "officialDatasheetUrl": "https://www.nxp.com/products/rfid-nfc/mifare-hf/mifare-readers/contactless-reader-ic%3AMFRC52202HN1",
    },
    "MAX31855": {
        "officialDatasheetUrl": "https://www.analog.com/en/products/max31855.html",
    },
    "MAX6675": {
        "officialDatasheetUrl": "https://www.analog.com/en/products/max6675.html",
    },
    "HC-05": {
        "moduleDocumentUrls": [
            "https://wiki.dfrobot.com/Serial_Bluetooth_Module__SKU_TEL0026_",
        ],
    },
    "HC-06": {
        "moduleDocumentUrls": [
            "https://wiki.dfrobot.com/Bluetooth_Module__SKU_DFR0117_",
        ],
    },
    "HM-10": {
        "moduleDocumentUrls": [
            "https://components101.com/sites/default/files/component_datasheet/HM10%20Bluetooth%20Module%20Datasheet.pdf",
        ],
    },
}

CURATED_SENSORS = [
    {"name": "DHT11", "category": "temperature_humidity", "aliases": ["DHT11"]},
    {"name": "DHT12", "category": "temperature_humidity", "aliases": ["DHT12"]},
    {"name": "DHT20", "category": "temperature_humidity", "aliases": ["DHT20"]},
    {"name": "DHT21", "category": "temperature_humidity", "aliases": ["DHT21", "AM2301"]},
    {"name": "DHT22", "category": "temperature_humidity", "aliases": ["DHT22", "AM2302"]},
    {"name": "AHT10", "category": "temperature_humidity", "aliases": ["AHT10"]},
    {"name": "AHT15", "category": "temperature_humidity", "aliases": ["AHT15"]},
    {"name": "AHT20", "category": "temperature_humidity", "aliases": ["AHT20"]},
    {"name": "AHT21", "category": "temperature_humidity", "aliases": ["AHT21"]},
    {"name": "AHT25", "category": "temperature_humidity", "aliases": ["AHT25"]},
    {"name": "MAX31855", "category": "temperature_humidity", "aliases": ["MAX31855"]},
    {"name": "MAX6675", "category": "temperature_humidity", "aliases": ["MAX6675"]},
    {"name": "SHT10", "category": "temperature_humidity", "aliases": ["SHT10", "SHT1X"]},
    {"name": "SHT20", "category": "temperature_humidity", "aliases": ["SHT20"]},
    {"name": "SHT21", "category": "temperature_humidity", "aliases": ["SHT21"]},
    {"name": "SHT30", "category": "temperature_humidity", "aliases": ["SHT30"]},
    {"name": "SHT31", "category": "temperature_humidity", "aliases": ["SHT31", "SHT31-D"]},
    {"name": "SHT35", "category": "temperature_humidity", "aliases": ["SHT35"]},
    {"name": "SHT40", "category": "temperature_humidity", "aliases": ["SHT40", "SHT4X"]},
    {"name": "SHT41", "category": "temperature_humidity", "aliases": ["SHT41"]},
    {"name": "SHT45", "category": "temperature_humidity", "aliases": ["SHT45"]},
    {"name": "SHTC3", "category": "temperature_humidity", "aliases": ["SHTC3"]},
    {"name": "SI7021", "category": "temperature_humidity", "aliases": ["SI7021"]},
    {"name": "HTU21D", "category": "temperature_humidity", "aliases": ["HTU21D"]},
    {"name": "HDC1080", "category": "temperature_humidity", "aliases": ["HDC1080"]},
    {"name": "HDC2080", "category": "temperature_humidity", "aliases": ["HDC2080"]},
    {"name": "AM2320", "category": "temperature_humidity", "aliases": ["AM2320"]},
    {"name": "BME280", "category": "temperature_humidity", "aliases": ["BME280", "GY-BME280"]},
    {"name": "BME680", "category": "temperature_humidity", "aliases": ["BME680", "CJMCU-680"]},
    {"name": "BMP180", "category": "pressure", "aliases": ["BMP180", "GY-68"]},
    {"name": "BMP280", "category": "pressure", "aliases": ["BMP280", "GY-BMP280"]},
    {"name": "BMP388", "category": "pressure", "aliases": ["BMP388"]},
    {"name": "BMP390", "category": "pressure", "aliases": ["BMP390", "BMP3XX"]},
    {"name": "DPS310", "category": "pressure", "aliases": ["DPS310"]},
    {"name": "LPS22HB", "category": "pressure", "aliases": ["LPS22HB"]},
    {"name": "LPS22HH", "category": "pressure", "aliases": ["LPS22HH"]},
    {"name": "LPS25HB", "category": "pressure", "aliases": ["LPS25HB"]},
    {"name": "MS5611", "category": "pressure", "aliases": ["MS5611"]},
    {"name": "MPL3115A2", "category": "pressure", "aliases": ["MPL3115A2"]},
    {"name": "ICP10100", "category": "pressure", "aliases": ["ICP10100"]},
    {"name": "TMP102", "category": "temperature_humidity", "aliases": ["TMP102"]},
    {"name": "TMP117", "category": "temperature_humidity", "aliases": ["TMP117"]},
    {"name": "MCP9808", "category": "temperature_humidity", "aliases": ["MCP9808"]},
    {"name": "LM35", "category": "temperature_humidity", "aliases": ["LM35"]},
    {"name": "TMP36", "category": "temperature_humidity", "aliases": ["TMP36"]},
    {"name": "DS18B20", "category": "temperature_humidity", "aliases": ["DS18B20"]},
    {"name": "MLX90614", "category": "temperature_humidity", "aliases": ["MLX90614", "GY-906"]},
    {"name": "MLX90640", "category": "temperature_humidity", "aliases": ["MLX90640"]},
    {"name": "AMG8833", "category": "temperature_humidity", "aliases": ["AMG8833"]},
    {"name": "BH1750", "category": "light", "aliases": ["BH1750", "GY-30", "GY-302"]},
    {"name": "LDR", "category": "light", "aliases": ["LDR", "GL5516", "PHOTORESISTOR", "PHOTOCELL"]},
    {"name": "TSL2561", "category": "light", "aliases": ["TSL2561"]},
    {"name": "TSL2591", "category": "light", "aliases": ["TSL2591"]},
    {"name": "VEML7700", "category": "light", "aliases": ["VEML7700"]},
    {"name": "VEML6030", "category": "light", "aliases": ["VEML6030"]},
    {"name": "VEML6070", "category": "light", "aliases": ["VEML6070"]},
    {"name": "VEML6075", "category": "light", "aliases": ["VEML6075"]},
    {"name": "OPT3001", "category": "light", "aliases": ["OPT3001"]},
    {"name": "TEMT6000", "category": "light", "aliases": ["TEMT6000"]},
    {"name": "TCS34725", "category": "light", "aliases": ["TCS34725"]},
    {"name": "TCS3400", "category": "light", "aliases": ["TCS3400"]},
    {"name": "APDS9960", "category": "light", "aliases": ["APDS9960"]},
    {"name": "LTR390", "category": "light", "aliases": ["LTR390"]},
    {"name": "SI1145", "category": "light", "aliases": ["SI1145"]},
    {"name": "ML8511", "category": "light", "aliases": ["ML8511"]},
    {"name": "AS7341", "category": "light", "aliases": ["AS7341"]},
    {"name": "ISL29125", "category": "light", "aliases": ["ISL29125"]},
    {"name": "OPT101", "category": "light", "aliases": ["OPT101"]},
    {"name": "FLAME-SENSOR", "category": "light", "aliases": ["MAX06", "FLAME SENSOR", "IR FLAME SENSOR"]},
    {"name": "VCNL4010", "category": "proximity", "aliases": ["VCNL4010"]},
    {"name": "VCNL4040", "category": "proximity", "aliases": ["VCNL4040"]},
    {"name": "VCNL4200", "category": "proximity", "aliases": ["VCNL4200"]},
    {"name": "VL53L0X", "category": "proximity", "aliases": ["VL53L0X"]},
    {"name": "VL53L1X", "category": "proximity", "aliases": ["VL53L1X"]},
    {"name": "VL53L4CD", "category": "proximity", "aliases": ["VL53L4CD"]},
    {"name": "VL53L4CX", "category": "proximity", "aliases": ["VL53L4CX"]},
    {"name": "VL6180X", "category": "proximity", "aliases": ["VL6180X"]},
    {"name": "GP2Y0A21YK0F", "category": "proximity", "aliases": ["GP2Y0A21YK0F"]},
    {"name": "GP2Y0A02YK0F", "category": "proximity", "aliases": ["GP2Y0A02YK0F"]},
    {"name": "GP2Y0A41SK0F", "category": "proximity", "aliases": ["GP2Y0A41SK0F"]},
    {"name": "HC-SR04", "category": "proximity", "aliases": ["HC-SR04"]},
    {"name": "HC-SR505", "category": "proximity", "aliases": ["HC-SR505"]},
    {"name": "URM09", "category": "proximity", "aliases": ["URM09"]},
    {"name": "URM06", "category": "proximity", "aliases": ["URM06"]},
    {"name": "TFMINI", "category": "proximity", "aliases": ["TFMINI", "TF MINI", "TFMINI-S"]},
    {"name": "TFMINI-PLUS", "category": "proximity", "aliases": ["TFMINI PLUS", "TFMINI-PLUS", "TF MINI PLUS"]},
    {"name": "MPU-6050", "category": "motion", "aliases": ["MPU-6050", "MPU6050", "GY-521"]},
    {"name": "MPU-6500", "category": "motion", "aliases": ["MPU-6500", "MPU6500"]},
    {"name": "MPU-9250", "category": "motion", "aliases": ["MPU-9250", "MPU9250"]},
    {"name": "MPU-9255", "category": "motion", "aliases": ["MPU-9255", "MPU9255"]},
    {"name": "BMX160", "category": "motion", "aliases": ["BMX160"]},
    {"name": "ICM-20602", "category": "motion", "aliases": ["ICM-20602", "ICM20602"]},
    {"name": "ICM-20948", "category": "motion", "aliases": ["ICM-20948", "ICM20948"]},
    {"name": "BMI160", "category": "motion", "aliases": ["BMI160"]},
    {"name": "BMI270", "category": "motion", "aliases": ["BMI270"]},
    {"name": "BMI088", "category": "motion", "aliases": ["BMI088"]},
    {"name": "BMA180", "category": "motion", "aliases": ["BMA180"]},
    {"name": "BMA220", "category": "motion", "aliases": ["BMA220"]},
    {"name": "BMA250", "category": "motion", "aliases": ["BMA250"]},
    {"name": "BMA400", "category": "motion", "aliases": ["BMA400"]},
    {"name": "BMA456", "category": "motion", "aliases": ["BMA456"]},
    {"name": "ADXL335", "category": "motion", "aliases": ["ADXL335"]},
    {"name": "ADXL345", "category": "motion", "aliases": ["ADXL345"]},
    {"name": "ADXL375", "category": "motion", "aliases": ["ADXL375"]},
    {"name": "LIS3DH", "category": "motion", "aliases": ["LIS3DH"]},
    {"name": "LIS2DH12", "category": "motion", "aliases": ["LIS2DH12"]},
    {"name": "LIS3DSH", "category": "motion", "aliases": ["LIS3DSH"]},
    {"name": "LSM6DS3", "category": "motion", "aliases": ["LSM6DS3"]},
    {"name": "LSM6DS3TR-C", "category": "motion", "aliases": ["LSM6DS3TR-C", "LSM6DS3TR"]},
    {"name": "LSM6DSOX", "category": "motion", "aliases": ["LSM6DSOX"]},
    {"name": "LSM9DS1", "category": "motion", "aliases": ["LSM9DS1"]},
    {"name": "HMC5883L", "category": "motion", "aliases": ["HMC5883L", "GY-271", "GY-273"]},
    {"name": "QMC5883L", "category": "motion", "aliases": ["QMC5883L", "GY-271", "GY-273"]},
    {"name": "LIS3MDL", "category": "motion", "aliases": ["LIS3MDL"]},
    {"name": "MMC5603", "category": "motion", "aliases": ["MMC5603"]},
    {"name": "AK8963", "category": "motion", "aliases": ["AK8963"]},
    {"name": "BNO055", "category": "motion", "aliases": ["BNO055"]},
    {"name": "BNO080", "category": "motion", "aliases": ["BNO080"]},
    {"name": "BNO085", "category": "motion", "aliases": ["BNO085"]},
    {"name": "MQ-2", "category": "gas", "aliases": ["MQ-2", "MQ2"]},
    {"name": "MQ-3", "category": "gas", "aliases": ["MQ-3", "MQ3"]},
    {"name": "MQ-4", "category": "gas", "aliases": ["MQ-4", "MQ4"]},
    {"name": "MQ-5", "category": "gas", "aliases": ["MQ-5", "MQ5"]},
    {"name": "MQ-6", "category": "gas", "aliases": ["MQ-6", "MQ6"]},
    {"name": "MQ-7", "category": "gas", "aliases": ["MQ-7", "MQ7"]},
    {"name": "MQ-8", "category": "gas", "aliases": ["MQ-8", "MQ8"]},
    {"name": "MQ-9", "category": "gas", "aliases": ["MQ-9", "MQ9"]},
    {"name": "MQ-131", "category": "gas", "aliases": ["MQ-131", "MQ131"]},
    {"name": "MQ-135", "category": "gas", "aliases": ["MQ-135", "MQ135"]},
    {"name": "CCS811", "category": "gas", "aliases": ["CCS811", "CJMCU-811"]},
    {"name": "ENS160", "category": "gas", "aliases": ["ENS160"]},
    {"name": "SGP30", "category": "gas", "aliases": ["SGP30"]},
    {"name": "SGP40", "category": "gas", "aliases": ["SGP40"]},
    {"name": "SGP41", "category": "gas", "aliases": ["SGP41"]},
    {"name": "MICS5524", "category": "gas", "aliases": ["MICS5524"]},
    {"name": "MICS6814", "category": "gas", "aliases": ["MICS6814"]},
    {"name": "ZE08-CH2O", "category": "gas", "aliases": ["ZE08-CH2O", "ZE08 CH2O"]},
    {"name": "MH-Z19B", "category": "gas", "aliases": ["MH-Z19B", "MHZ19B"]},
    {"name": "MH-Z19C", "category": "gas", "aliases": ["MH-Z19C", "MHZ19C"]},
    {"name": "SCD30", "category": "gas", "aliases": ["SCD30"]},
    {"name": "SCD40", "category": "gas", "aliases": ["SCD40"]},
    {"name": "SCD41", "category": "gas", "aliases": ["SCD41"]},
    {"name": "SFA30", "category": "gas", "aliases": ["SFA30"]},
    {"name": "PMS5003", "category": "gas", "aliases": ["PMS5003"]},
    {"name": "PMS7003", "category": "gas", "aliases": ["PMS7003"]},
    {"name": "SDS011", "category": "gas", "aliases": ["SDS011"]},
    {"name": "SPS30", "category": "gas", "aliases": ["SPS30"]},
    {"name": "GP2Y1010AU0F", "category": "gas", "aliases": ["GP2Y1010AU0F"]},
    {"name": "MAX4466", "category": "sound", "aliases": ["MAX4466", "GY-MAX4466"]},
    {"name": "MAX9814", "category": "sound", "aliases": ["MAX9814"]},
    {"name": "INMP441", "category": "sound", "aliases": ["INMP441"]},
    {"name": "ICS43434", "category": "sound", "aliases": ["ICS43434"]},
    {"name": "SPH0645", "category": "sound", "aliases": ["SPH0645", "SPH0645LM4H"]},
    {"name": "MAX30100", "category": "biometric", "aliases": ["MAX30100"]},
    {"name": "MAX30101", "category": "biometric", "aliases": ["MAX30101"]},
    {"name": "MAX30102", "category": "biometric", "aliases": ["MAX30102", "GY-MAX30102"]},
    {"name": "MAX86141", "category": "biometric", "aliases": ["MAX86141"]},
    {"name": "AD8232", "category": "biometric", "aliases": ["AD8232"]},
    {"name": "PULSE-SENSOR", "category": "biometric", "aliases": ["PULSE SENSOR", "SEN-11574", "HEART RATE SENSOR"]},
    {"name": "MYOWARE", "category": "biometric", "aliases": ["MYOWARE", "AT-04-001", "EMG SENSOR"]},
    {"name": "GSR", "category": "biometric", "aliases": ["GSR", "GALVANIC SKIN RESPONSE"]},
    {"name": "HX711", "category": "weight", "aliases": ["HX711"]},
    {"name": "NAU7802", "category": "weight", "aliases": ["NAU7802"]},
    {"name": "TTP223", "category": "touch", "aliases": ["TTP223"]},
    {"name": "CAP1188", "category": "touch", "aliases": ["CAP1188"]},
    {"name": "MPR121", "category": "touch", "aliases": ["MPR121"]},
    {"name": "A3144", "category": "magnetic", "aliases": ["A3144"]},
    {"name": "SS49E", "category": "magnetic", "aliases": ["SS49E"]},
    {"name": "DRV5053", "category": "magnetic", "aliases": ["DRV5053"]},
    {"name": "NEO-6M", "category": "location", "aliases": ["NEO-6M", "GY-NEO6MV2"]},
    {"name": "NEO-M8N", "category": "location", "aliases": ["NEO-M8N", "NEOM8N"]},
    {"name": "PA1010D", "category": "location", "aliases": ["PA1010D"]},
    {"name": "L76K", "category": "location", "aliases": ["L76K"]},
    {"name": "YF-S201", "category": "flow", "aliases": ["YF-S201"]},
    {"name": "FS3000", "category": "flow", "aliases": ["FS3000"]},
    {"name": "A201", "category": "force", "aliases": ["A201", "FSR"]},
    {"name": "SW-420", "category": "vibration", "aliases": ["SW-420"]},
    {"name": "HDX-2801", "category": "vibration", "aliases": ["HDX-2801", "TILT SENSOR"]},
    {"name": "ADXL001", "category": "vibration", "aliases": ["ADXL001"]},
    {"name": "HC-SR501", "category": "proximity", "aliases": ["HC-SR501"]},
    {"name": "AM312", "category": "proximity", "aliases": ["AM312"]},
    {"name": "RCWL-0516", "category": "proximity", "aliases": ["RCWL-0516"]},
    {"name": "KY-037", "category": "sound", "aliases": ["KY-037"]},
    {"name": "KY-038", "category": "sound", "aliases": ["KY-038"]},
    {"name": "TCS3200", "category": "light", "aliases": ["TCS3200"]},
    {"name": "AS5600", "category": "position", "aliases": ["AS5600"]},
    {"name": "KY-024", "category": "magnetic", "aliases": ["KY-024"]},
    {"name": "KY-026", "category": "sensor", "aliases": ["KY-026"]},
    {"name": "YL-69", "category": "moisture", "aliases": ["YL-69"]},
    {"name": "CAPACITIVE-SOIL-MOISTURE", "category": "moisture", "aliases": ["CAPACITIVE SOIL", "CAPACITIVE SOIL MOISTURE", "SOIL MOISTURE"]},
    {"name": "RAINDROPS-SENSOR", "category": "water", "aliases": ["RAINDROPS SENSOR", "RAIN SENSOR", "RAIN DROP MODULE"]},
    {"name": "WATER-LEVEL-SENSOR", "category": "water", "aliases": ["WATER LEVEL SENSOR", "WATER SENSOR"]},
    {"name": "ANALOG-PH-SENSOR", "category": "water", "aliases": ["PH SENSOR", "SEN0161", "ANALOG PH SENSOR"]},
    {"name": "TDS-SENSOR", "category": "water", "aliases": ["TDS SENSOR", "SEN0244"]},
    {"name": "TURBIDITY-SENSOR", "category": "water", "aliases": ["TURBIDITY SENSOR", "TS-300B"]},
    {"name": "FC-37", "category": "water", "aliases": ["FC-37"]},
    {"name": "ACS712", "category": "power_monitor", "aliases": ["ACS712"]},
    {"name": "INA219", "category": "power_monitor", "aliases": ["INA219"]},
    {"name": "INA226", "category": "power_monitor", "aliases": ["INA226"]},
    {"name": "ZMPT101B", "category": "power_monitor", "aliases": ["ZMPT101B"]},
    {"name": "SCT-013-000", "category": "power_monitor", "aliases": ["SCT-013-000", "SCT013000"]},
    {"name": "VOLTAGE-DIVIDER-MODULE", "category": "power_monitor", "aliases": ["VOLTAGE DIVIDER MODULE", "VOLTAGE SENSOR MODULE"]},
    {"name": "PN532", "category": "rf", "aliases": ["PN532"]},
    {"name": "MFRC522", "category": "rf", "aliases": ["MFRC522", "RC522"]},
    {"name": "AS608", "category": "biometric", "aliases": ["AS608"]},
    {"name": "R503", "category": "biometric", "aliases": ["R503"]},
    {"name": "US5881", "category": "magnetic", "aliases": ["US5881"]},
    {"name": "EC11", "category": "position", "aliases": ["EC11", "ROTARY ENCODER", "KY-040"]},
    {"name": "HC-05", "category": "rf", "aliases": ["HC-05", "HC05"]},
    {"name": "HC-06", "category": "rf", "aliases": ["HC-06", "HC06"]},
    {"name": "JDY-31", "category": "rf", "aliases": ["JDY-31", "JDY31"]},
    {"name": "HM-10", "category": "rf", "aliases": ["HM-10", "HM10", "CC2541"]},
    {"name": "NRF24L01", "category": "rf", "aliases": ["NRF24L01", "NRF24L01+"]},
    {"name": "ESP-01", "category": "rf", "aliases": ["ESP-01", "ESP01"]},
    {"name": "HC-12", "category": "rf", "aliases": ["HC-12", "HC12"]},
    {"name": "SSD1306", "category": "display", "aliases": ["SSD1306"]},
    {"name": "SH1106", "category": "display", "aliases": ["SH1106"]},
    {"name": "LCD1602", "category": "display", "aliases": ["LCD1602", "1602 LCD"]},
    {"name": "LCD2004", "category": "display", "aliases": ["LCD2004", "2004 LCD"]},
    {"name": "MAX7219", "category": "display", "aliases": ["MAX7219"]},
    {"name": "TM1637", "category": "display", "aliases": ["TM1637"]},
    {"name": "ILI9341", "category": "display", "aliases": ["ILI9341"]},
    {"name": "DS3231", "category": "timing", "aliases": ["DS3231"]},
    {"name": "DS1307", "category": "timing", "aliases": ["DS1307"]},
    {"name": "KY-023", "category": "input", "aliases": ["KY-023", "JOYSTICK MODULE", "DUAL AXIS JOYSTICK"]},
    {"name": "MCP2515", "category": "interface", "aliases": ["MCP2515"]},
    {"name": "MCP3008", "category": "analog_frontend", "aliases": ["MCP3008"]},
    {"name": "PCA9685", "category": "interface", "aliases": ["PCA9685"]},
    {"name": "10DOF-MPU9250-BMP280", "category": "motion", "aliases": ["10DOF", "MPU9250 BMP280", "GY-91"]},
    {"name": "SEN5X", "category": "gas", "aliases": ["SEN54", "SEN55", "SEN50", "SEN5X"]},
    {"name": "SVM30", "category": "gas", "aliases": ["SVM30"]},
    {"name": "ICM42688", "category": "motion", "aliases": ["ICM-42688", "ICM42688"]},
    {"name": "ISM330DHCX", "category": "motion", "aliases": ["ISM330DHCX"]},
    {"name": "LSM303AGR", "category": "motion", "aliases": ["LSM303AGR"]},
    {"name": "LSM303DLHC", "category": "motion", "aliases": ["LSM303DLHC"]},
    {"name": "FXOS8700", "category": "motion", "aliases": ["FXOS8700"]},
    {"name": "FXAS21002", "category": "motion", "aliases": ["FXAS21002"]},
    {"name": "MMA8451", "category": "motion", "aliases": ["MMA8451"]},
    {"name": "MMA8452Q", "category": "motion", "aliases": ["MMA8452Q"]},
    {"name": "MPL115A2", "category": "pressure", "aliases": ["MPL115A2"]},
    {"name": "BMP581", "category": "pressure", "aliases": ["BMP581"]},
    {"name": "BMP585", "category": "pressure", "aliases": ["BMP585"]},
    {"name": "LTR303", "category": "light", "aliases": ["LTR303"]},
    {"name": "LTR559", "category": "light", "aliases": ["LTR559"]},
    {"name": "TMAG5273", "category": "magnetic", "aliases": ["TMAG5273"]},
    {"name": "TMAG5170", "category": "magnetic", "aliases": ["TMAG5170"]},
    {"name": "INA260", "category": "power_monitor", "aliases": ["INA260"]},
]


def normalize_token(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "", value.upper())


def load_rows(path: pathlib.Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, dict):
        if isinstance(payload.get("rows"), list):
            return payload["rows"]
        if isinstance(payload.get("candidates"), list):
            return payload["candidates"]
    if isinstance(payload, list):
        return payload
    raise ValueError(f"Unsupported payload shape: {path}")


def row_text(row: dict) -> str:
    values = [
        row.get("url", ""),
        row.get("titleHint", ""),
        row.get("canonicalMpn", ""),
        row.get("notes", ""),
        " ".join(row.get("partNumbers") or []),
    ]
    return " ".join(values)


def score_match(row: dict, aliases: list[str]) -> int:
    text = row_text(row)
    text_norm = normalize_token(text)
    score = 0
    for alias in aliases:
        alias_norm = normalize_token(alias)
        if not alias_norm:
            continue
        if alias_norm == normalize_token(row.get("canonicalMpn", "")):
            score += 10
        if alias_norm in [normalize_token(item) for item in row.get("partNumbers") or []]:
            score += 8
        if alias_norm in text_norm:
            score += 4
        if alias.upper() in text.upper():
            score += 2
    return score


def is_probable_official_datasheet(row: dict) -> bool:
    host = (row.get("host") or "").lower()
    vendor = (row.get("vendor") or "").lower()
    url = row.get("url") or ""
    if vendor in {"adi", "bosch", "sensirion", "st"}:
        return True
    if host in MODULE_VENDOR_HOSTS:
        return False
    if url.lower().endswith(".pdf"):
        return True
    return False


def dedupe_rows(rows: list[dict]) -> list[dict]:
    seen: set[str] = set()
    unique: list[dict] = []
    for row in rows:
        url = row.get("url")
        if not url or url in seen:
            continue
        seen.add(url)
        unique.append(row)
    return unique


def make_manual_row(canonical_name: str, category: str, url: str, source_type: str) -> dict:
    host = re.sub(r"^https?://", "", url).split("/", 1)[0].lower()
    vendor = "manual-official" if source_type == "manual_official_doc" else "manual-module"
    return {
        "url": url,
        "host": host,
        "vendor": vendor,
        "vendorLabel": "Manual override",
        "sourceType": source_type,
        "sourcePath": canonical_name,
        "titleHint": canonical_name,
        "categoryGuess": category,
        "quality": "official",
        "canonicalMpn": canonical_name,
        "partNumbers": [canonical_name],
        "notes": f"Manual override for {canonical_name}",
    }


def choose_official_url(matches: list[dict]) -> str | None:
    preferred = [row for row in matches if is_probable_official_datasheet(row)]
    ranked = preferred or matches
    ranked = sorted(
        ranked,
        key=lambda row: (
            0 if (row.get("url") or "").lower().endswith(".pdf") else 1,
            0 if (row.get("vendor") or "") in {"adi", "bosch", "sensirion", "st"} else 1,
            len(row.get("url") or ""),
        ),
    )
    return ranked[0]["url"] if ranked else None


def build_sensor_entry(sensor: dict, all_rows: list[dict]) -> dict:
    aliases = sensor["aliases"]
    scored = []
    for row in all_rows:
        score = score_match(row, aliases)
        if score > 0:
            scored.append((score, row))

    scored.sort(key=lambda item: (-item[0], item[1].get("url", "")))
    matches = dedupe_rows([row for _, row in scored])
    override = MANUAL_OVERRIDES.get(sensor["name"], {})
    manual_rows: list[dict] = []
    if override.get("officialDatasheetUrl"):
        manual_rows.append(
            make_manual_row(
                sensor["name"],
                sensor["category"],
                override["officialDatasheetUrl"],
                "manual_official_doc",
            )
        )
    for url in override.get("moduleDocumentUrls", []):
        manual_rows.append(
            make_manual_row(
                sensor["name"],
                sensor["category"],
                url,
                "manual_module_doc",
            )
        )
    matches = dedupe_rows(manual_rows + matches)
    official_url = choose_official_url(matches)
    module_docs = [row["url"] for row in matches if (row.get("host") or "").lower() in MODULE_VENDOR_HOSTS][:8]
    official_docs = [row["url"] for row in matches if is_probable_official_datasheet(row)][:5]
    source_vendors = sorted({row.get("vendor", "unknown") for row in matches})
    module_vendor_counts = Counter(row.get("vendor", "unknown") for row in matches if (row.get("host") or "").lower() in MODULE_VENDOR_HOSTS)

    return {
        "canonicalName": sensor["name"],
        "category": sensor["category"],
        "aliases": aliases,
        "officialDatasheetUrl": official_url,
        "officialDocumentUrls": official_docs,
        "moduleDocumentUrls": module_docs,
        "sourceVendors": source_vendors,
        "matchCount": len(matches),
        "moduleVendorCounts": dict(module_vendor_counts),
        "matchedRows": matches[:12],
    }


def flatten_rows(sensors: list[dict]) -> list[dict]:
    rows: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for sensor in sensors:
        canonical = sensor["canonicalName"]
        category = sensor["category"]
        for url in sensor.get("officialDocumentUrls") or []:
            key = (canonical, url)
            if key in seen:
                continue
            seen.add(key)
            rows.append(
                {
                    "url": url,
                    "host": re.sub(r"^https?://", "", url).split("/", 1)[0].lower(),
                    "vendor": "curated-official",
                    "vendorLabel": "Curated Official Datasheet",
                    "sourceType": "popular_sensor_official",
                    "sourcePath": canonical,
                    "titleHint": canonical,
                    "categoryGuess": category,
                    "quality": "official",
                    "canonicalMpn": canonical,
                    "partNumbers": [canonical, *sensor.get("aliases", [])[:4]],
                    "notes": f"Curated official document for {canonical}",
                }
            )
        for url in sensor.get("moduleDocumentUrls") or []:
            key = (canonical, url)
            if key in seen:
                continue
            seen.add(key)
            rows.append(
                {
                    "url": url,
                    "host": re.sub(r"^https?://", "", url).split("/", 1)[0].lower(),
                    "vendor": "curated-module",
                    "vendorLabel": "Curated Module Documentation",
                    "sourceType": "popular_sensor_module_doc",
                    "sourcePath": canonical,
                    "titleHint": canonical,
                    "categoryGuess": category,
                    "quality": "official",
                    "canonicalMpn": canonical,
                    "partNumbers": [canonical, *sensor.get("aliases", [])[:4]],
                    "notes": f"Curated module document for {canonical}",
                }
            )
    return rows


def is_sensor_category(category: str) -> bool:
    return category in SENSOR_CATEGORY_PREFIXES


def main() -> int:
    parser = argparse.ArgumentParser(description="Build curated popular sensor catalog")
    parser.add_argument("--module-docs", type=pathlib.Path, default=DEFAULT_MODULE_DOCS)
    parser.add_argument("--official-candidates", type=pathlib.Path, default=DEFAULT_OFFICIAL_CANDIDATES)
    parser.add_argument("--output", type=pathlib.Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--extra-catalog", type=pathlib.Path, action="append", default=[])
    args = parser.parse_args()

    module_rows = load_rows(args.module_docs)
    extra_catalogs = [path for path in DEFAULT_EXTRA_CATALOGS if path.exists()] + [
        path for path in args.extra_catalog if path.exists()
    ]
    for extra_catalog in extra_catalogs:
        module_rows.extend(load_rows(extra_catalog))
    official_rows = load_rows(args.official_candidates)
    all_rows = module_rows + official_rows

    sensors = [build_sensor_entry(sensor, all_rows) for sensor in CURATED_SENSORS]
    rows = flatten_rows(sensors)
    coverage = Counter()
    for sensor in sensors:
        if sensor["officialDatasheetUrl"]:
            coverage["withOfficialDatasheet"] += 1
        if sensor["moduleDocumentUrls"]:
            coverage["withModuleDocs"] += 1
        if sensor["matchCount"] > 0:
            coverage["withAnyMatch"] += 1
        else:
            coverage["withoutMatches"] += 1

    payload = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sensorCount": len(sensors),
        "documentRowCount": len(rows),
        "coverage": dict(coverage),
        "sources": {
            "moduleDocs": str(args.module_docs),
            "officialCandidates": str(args.official_candidates),
            "extraCatalogs": [str(path) for path in extra_catalogs],
        },
        "sensors": sensors,
        "rows": rows,
        "sensorOnly": [sensor for sensor in sensors if is_sensor_category(sensor["category"])],
        "moduleAndPeripheralOnly": [sensor for sensor in sensors if not is_sensor_category(sensor["category"])],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    sensor_only_path = args.output.with_name(f"{args.output.stem}-sensor-only.json")
    module_only_path = args.output.with_name(f"{args.output.stem}-module-peripheral-only.json")
    sensor_only_path.write_text(
        json.dumps(
            {
                "generatedAt": payload["generatedAt"],
                "source": str(args.output),
                "count": len(payload["sensorOnly"]),
                "sensors": payload["sensorOnly"],
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    module_only_path.write_text(
        json.dumps(
            {
                "generatedAt": payload["generatedAt"],
                "source": str(args.output),
                "count": len(payload["moduleAndPeripheralOnly"]),
                "sensors": payload["moduleAndPeripheralOnly"],
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    print(f"Wrote {args.output}")
    print(f"Wrote {sensor_only_path}")
    print(f"Wrote {module_only_path}")
    print(f"Curated sensors: {len(sensors)}")
    print(f"Document rows: {len(rows)}")
    print(json.dumps(payload["coverage"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
