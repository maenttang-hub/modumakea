# Datasheet Registry

This registry is the source of truth for sensors that are allowed into the
library because an official vendor document has been pinned first.

## Important Note

This workspace runtime can browse official datasheet URLs, but it cannot fetch
and save external PDF binaries into the repository because outbound network
access for shell commands is blocked here.

So the current rule is:

- only sensors with pinned official sources are added
- the app stores the exact source URLs in code
- local PDF mirroring is still pending a network-enabled download step

## Status Key

- `official-complete`: official datasheet or equivalent vendor primary document pinned
- `official-partial`: vendor identity confirmed, but full electrical table is not yet pinned

## Verified Sensors

| Template ID | Sensor | Status | Official source |
| --- | --- | --- | --- |
| `tpl_bmp280` | BMP280 | `official-complete` | https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmp280-ds001.pdf |
| `tpl_bme280` | BME280 | `official-complete` | https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme280-ds002.pdf |
| `tpl_bme680` | BME680 | `official-complete` | https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme680-ds001.pdf |
| `tpl_ds18b20` | DS18B20 | `official-complete` | https://www.analog.com/media/en/technical-documentation/data-sheets/DS18B20.pdf |
| `tpl_lm35` | LM35 | `official-complete` | https://www.ti.com/lit/gpn/lm35 |
| `tpl_sht31` | SHT31 | `official-complete` | https://sensirion.com/media/documents/213E6A3B/63A5A569/Datasheet_SHT3x_DIS.pdf |
| `tpl_vl53l0x` | VL53L0X | `official-complete` | https://www.st.com/resource/en/datasheet/vl53l0x.pdf |
| `tpl_vl53l1x` | VL53L1X | `official-complete` | https://www.st.com/resource/en/datasheet/vl53l1x.pdf |
| `tpl_bno055` | BNO055 | `official-complete` | https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bno055-ds000.pdf |
| `tpl_ina219` | INA219 | `official-complete` | https://www.ti.com/lit/gpn/ina219 |
| `tpl_max30102` | MAX30102 | `official-complete` | https://www.analog.com/media/en/technical-documentation/data-sheets/MAX30102.pdf |
| `tpl_dht11` | DHT11 | `official-partial` | https://www.aosong.com/en/Products/info.aspx?itemid=2257&lcid=139 |
| `tpl_dht22` | DHT22 / AM2302 | `official-partial` | https://www.aosong.com/en/Products/info.aspx?itemid=2294&lcid=139 |
| `tpl_gas_mq2` | MQ-2 | `official-complete` | https://www.winsen-sensor.com/d/files/manual/mq-2.pdf |
| `tpl_rfid_rc522` | MFRC522 | `official-complete` | https://www.nxp.com/docs/en/data-sheet/MFRC522.pdf |

## Hold Queue

These should not be added back as normal library entries until an official
datasheet or exact module SKU is pinned:

- HC-SR04
- generic PIR modules
- generic photoresistor modules
- generic sound sensor modules
- generic rain / water level boards
- MAX6675 breakout variants
