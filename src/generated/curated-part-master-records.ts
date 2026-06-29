import type { PartMasterRecord } from '@/lib/part-master-catalog';

// Generated from config/part-master/curated-part-master-source.json
export const CURATED_PART_MASTER_RECORDS: PartMasterRecord[] = [
  {
    "canonicalMpn": "DHT11",
    "manufacturerName": "Aosong",
    "normalizedPartName": "DHT11 digital temperature and humidity sensor",
    "datasheetUrl": "https://electronicoscaldas.com/datasheet/DHT11_Aosong.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "DHT11-MODULE",
      "KY-015"
    ],
    "supportingUrls": [
      "https://wiki.dfrobot.com/DFR0067",
      "https://wiki.keyestudio.com/Ks0034_keyestudio_DHT11_Temperature_and_Humidity_Sensor"
    ],
    "pinSchemaJson": {
      "package": "Module",
      "pinCount": 3,
      "powerPins": [
        "VCC"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "DATA"
      ],
      "interfaces": [
        "ONEWIRE"
      ]
    },
    "specsJson": {
      "category": "sensor",
      "summary": "저가형 디지털 온습도 센서 모듈.",
      "supplyVoltage": {
        "min": 3.3,
        "typ": 5,
        "max": 5.5,
        "recommended": [
          5,
          3.3
        ]
      },
      "ioVoltage": {
        "nominal": [
          5,
          3.3
        ]
      },
      "interfaces": [
        "ONEWIRE"
      ],
      "requiresExternalParts": [
        "데이터 라인 풀업 저항"
      ],
      "recommendedCircuit": [
        "3핀 모듈은 보드 내 풀업 포함 여부 확인"
      ],
      "validationHints": {
        "biasResistors": [
          {
            "pinNames": [
              "DATA"
            ],
            "kind": "pull-up",
            "minimumCount": 1,
            "resistanceRangeOhms": [
              3300,
              10000
            ],
            "reason": "single-wire-data",
            "note": "DHT11 데이터 라인은 단일 버스 구동을 위해 보통 4.7kΩ 전후 풀업을 둡니다."
          }
        ]
      },
      "tags": [
        "temperature",
        "humidity",
        "module"
      ],
      "currentConsumption": {
        "idleUa": 60,
        "measureUa": 2500,
        "peakMa": 2.5,
        "notes": [
          "모듈 기준 대기전류는 매우 낮고 샘플링 중 mA 단위까지 상승 가능",
          "샘플링 주기와 풀업값에 따라 차이"
        ],
        "typicalActiveUa": 2500,
        "maxActiveUa": 2500,
        "typicalPeakMa": 2.5,
        "maxPeakMa": 2.5,
        "moduleOverheadMa": 0.8,
        "modes": [
          {
            "name": "idle",
            "currentUa": 60
          },
          {
            "name": "active",
            "currentUa": 2500
          },
          {
            "name": "peak-burst",
            "peakMa": 2.5
          }
        ],
        "defaultMode": "active"
      }
    }
  },
  {
    "canonicalMpn": "DHT22",
    "manufacturerName": "Aosong",
    "normalizedPartName": "DHT22 AM2302 digital temperature and humidity sensor",
    "datasheetUrl": "https://cdn.sparkfun.com/assets/f/7/d/9/c/DHT22.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "AM2302",
      "DHT22-MODULE"
    ],
    "supportingUrls": [
      "https://wiki.dfrobot.com/SEN0137",
      "https://wiki.keyestudio.com/KS0430_Keyestudio_DHT22_Temperature_and_Humidity_Sensor"
    ],
    "pinSchemaJson": {
      "package": "Module",
      "pinCount": 3,
      "powerPins": [
        "VCC"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "DATA"
      ],
      "interfaces": [
        "ONEWIRE"
      ]
    },
    "specsJson": {
      "category": "sensor",
      "summary": "DHT11보다 정밀도가 높은 디지털 온습도 센서 모듈.",
      "supplyVoltage": {
        "min": 3.3,
        "typ": 5,
        "max": 6,
        "recommended": [
          5,
          3.3
        ]
      },
      "ioVoltage": {
        "nominal": [
          5,
          3.3
        ]
      },
      "interfaces": [
        "ONEWIRE"
      ],
      "requiresExternalParts": [
        "데이터 라인 풀업 저항"
      ],
      "recommendedCircuit": [
        "긴 배선에서는 샘플링 주기와 풀업값 보수적으로 설정"
      ],
      "validationHints": {
        "biasResistors": [
          {
            "pinNames": [
              "DATA"
            ],
            "kind": "pull-up",
            "minimumCount": 1,
            "resistanceRangeOhms": [
              3300,
              10000
            ],
            "reason": "single-wire-data",
            "note": "DHT22/AM2302 데이터 라인은 보통 수 kΩ 풀업이 필요하며 긴 배선에서는 더 보수적으로 잡는 편이 안전합니다."
          }
        ]
      },
      "tags": [
        "temperature",
        "humidity",
        "module"
      ],
      "currentConsumption": {
        "sleepUa": 40,
        "measureUa": 1500,
        "peakMa": 2.5,
        "notes": [
          "AM2302 계열 기준 저속 샘플링 센서",
          "배선 길이와 샘플링 주기에 따라 전류 편차"
        ],
        "typicalActiveUa": 1500,
        "maxActiveUa": 1500,
        "typicalPeakMa": 2.5,
        "maxPeakMa": 2.5,
        "moduleOverheadMa": 0.8,
        "modes": [
          {
            "name": "sleep",
            "currentUa": 40
          },
          {
            "name": "active",
            "currentUa": 1500
          },
          {
            "name": "peak-burst",
            "peakMa": 2.5
          }
        ],
        "defaultMode": "active"
      }
    }
  },
  {
    "canonicalMpn": "AHT10",
    "manufacturerName": "Aosong",
    "normalizedPartName": "AHT10 digital temperature and humidity sensor",
    "datasheetUrl": "https://www.hestore.hu/prod_getfile.php?id=18482",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "AHT10 breakout"
    ],
    "pinSchemaJson": {
      "package": "SMD / Module",
      "powerPins": [
        "VIN",
        "VCC",
        "3V3"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "SCL",
        "SDA"
      ],
      "interfaces": [
        "I2C"
      ]
    },
    "specsJson": {
      "category": "sensor",
      "summary": "AHT20 이전 세대의 저전력 I2C 온습도 센서.",
      "supplyVoltage": {
        "min": 2.0,
        "typ": 3.3,
        "max": 5.5,
        "recommended": [
          3.3
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3
        ]
      },
      "interfaces": [
        "I2C"
      ],
      "requiresExternalParts": [
        "I2C 풀업 저항",
        "0.1uF 디커플링 커패시터"
      ],
      "recommendedCircuit": [
        "브레이크아웃이면 레벨시프터 포함 여부 확인",
        "AHT20과 혼동하지 않도록 센서 세대/라이브러리 호환성을 문서화"
      ],
      "validationHints": {
        "decoupling": {
          "minimumCapacitorCount": 1,
          "recommendedValues": [
            "0.1uF"
          ]
        }
      },
      "tags": [
        "temperature",
        "humidity",
        "i2c"
      ],
      "currentConsumption": {
        "sleepUa": 0.3,
        "idleUa": 0.5,
        "measureUa": 980,
        "peakMa": 1.0,
        "notes": [
          "AHT20과 유사한 저전력 계열로 보수적 스타터 프로파일",
          "모듈 레귤레이터와 LED가 있으면 실제 보드 전류는 더 큼"
        ],
        "typicalActiveUa": 980,
        "maxActiveUa": 980,
        "typicalPeakMa": 1.0,
        "maxPeakMa": 1.0,
        "moduleOverheadMa": 1.0,
        "modes": [
          {
            "name": "sleep",
            "currentUa": 0.3
          },
          {
            "name": "idle",
            "currentUa": 0.5
          },
          {
            "name": "active",
            "currentUa": 980
          },
          {
            "name": "peak-burst",
            "peakMa": 1.0
          }
        ],
        "defaultMode": "active"
      }
    }
  },
  {
    "canonicalMpn": "AHT20",
    "manufacturerName": "Aosong",
    "normalizedPartName": "AHT20 digital temperature and humidity sensor",
    "datasheetUrl": "https://www.aosong.com/userfiles/files/media/Data%20Sheet%20AHT20.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "supportingUrls": [
      "https://cdn-learn.adafruit.com/downloads/pdf/adafruit-aht20.pdf",
      "https://wiki.dfrobot.com/SEN0527",
      "https://wiki.seeedstudio.com/Grove-AHT20-I2C-Industrial-Grade-Temperature&Humidity-Sensor/"
    ],
    "pinSchemaJson": {
      "package": "Module",
      "powerPins": [
        "VIN",
        "3V3"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "SCL",
        "SDA"
      ],
      "interfaces": [
        "I2C"
      ]
    },
    "specsJson": {
      "category": "sensor",
      "summary": "저전력 I2C 온습도 센서.",
      "supplyVoltage": {
        "min": 2.0,
        "typ": 3.3,
        "max": 5.5,
        "recommended": [
          3.3
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3
        ]
      },
      "interfaces": [
        "I2C"
      ],
      "requiresExternalParts": [
        "I2C 풀업 저항",
        "0.1uF 디커플링 커패시터"
      ],
      "recommendedCircuit": [
        "브레이크아웃이면 레벨시프터 포함 여부 확인",
        "클론 모듈은 전원 LED/레귤레이터 때문에 실제 보드 전류가 커질 수 있음"
      ],
      "validationHints": {
        "decoupling": {
          "minimumCapacitorCount": 1,
          "recommendedValues": [
            "0.1uF"
          ],
          "note": "센서 전원 핀 또는 브레이크아웃 입력 근처 디커플링을 확인하는 편이 안전합니다."
        }
      },
      "tags": [
        "temperature",
        "humidity",
        "i2c"
      ],
      "currentConsumption": {
        "sleepUa": 0.25,
        "idleUa": 0.5,
        "measureUa": 980,
        "peakMa": 1.0,
        "notes": [
          "센서 코어 기준 저전력 동작",
          "브레이크아웃은 레귤레이터와 LED 때문에 보드 전류가 더 커질 수 있음"
        ],
        "typicalActiveUa": 980,
        "maxActiveUa": 980,
        "typicalPeakMa": 1.0,
        "maxPeakMa": 1.0,
        "moduleOverheadMa": 1.2,
        "modes": [
          {
            "name": "sleep",
            "currentUa": 0.25
          },
          {
            "name": "idle",
            "currentUa": 0.5
          },
          {
            "name": "active",
            "currentUa": 980
          },
          {
            "name": "peak-burst",
            "peakMa": 1.0
          }
        ],
        "defaultMode": "active"
      }
    }
  },
  {
    "canonicalMpn": "SHT31-DIS-B",
    "manufacturerName": "Sensirion",
    "normalizedPartName": "SHT31 digital humidity and temperature sensor",
    "datasheetUrl": "https://sensirion.com/media/documents/213E6A3B/63A5A569/Datasheet_SHT3x_DIS.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-complete",
    "supportingUrls": [
      "https://cdn-learn.adafruit.com/downloads/pdf/adafruit-sht31-d-temperature-and-humidity-sensor-breakout.pdf"
    ],
    "pinSchemaJson": {
      "package": "DFN-8",
      "pinCount": 8,
      "powerPins": [
        "VDD"
      ],
      "groundPins": [
        "VSS"
      ],
      "signalPins": [
        "SCL",
        "SDA",
        "ALERT",
        "ADDR"
      ],
      "interfaces": [
        "I2C"
      ]
    },
    "specsJson": {
      "category": "sensor",
      "summary": "고정밀 디지털 온습도 센서.",
      "supplyVoltage": {
        "min": 2.15,
        "typ": 3.3,
        "max": 5.5,
        "recommended": [
          3.3
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3,
          5
        ]
      },
      "interfaces": [
        "I2C"
      ],
      "requiresExternalParts": [
        "I2C 풀업 저항",
        "0.1uF 디커플링 커패시터"
      ],
      "recommendedCircuit": [
        "ADDR 스트랩과 센서 주변 열원 간격 확보"
      ],
      "validationHints": {
        "decoupling": {
          "minimumCapacitorCount": 1,
          "recommendedValues": [
            "0.1uF"
          ],
          "note": "센서 전원 핀 근처 디커플링과 짧은 리턴 경로를 권장합니다."
        },
        "strapPins": [
          {
            "pinNames": [
              "ADDR"
            ],
            "allowedReferences": [
              "power",
              "ground"
            ],
            "minimumCount": 1,
            "resistanceRangeOhms": [
              1000,
              100000
            ],
            "note": "SHT31의 ADDR은 I2C 주소 선택에 쓰이므로 다중 센서 설계에서는 기준 전위가 분명해야 합니다."
          }
        ]
      },
      "tags": [
        "temperature",
        "humidity",
        "i2c",
        "sensirion"
      ],
      "currentConsumption": {
        "sleepUa": 0.2,
        "idleUa": 0.5,
        "measureUa": 800,
        "peakMa": 1.5,
        "notes": [
          "반복 측정률과 히터 사용 여부에 따라 달라짐"
        ],
        "typicalActiveUa": 800,
        "maxActiveUa": 800,
        "typicalPeakMa": 1.5,
        "maxPeakMa": 1.5,
        "moduleOverheadMa": 1.0,
        "modes": [
          {
            "name": "sleep",
            "currentUa": 0.2
          },
          {
            "name": "idle",
            "currentUa": 0.5
          },
          {
            "name": "active",
            "currentUa": 800
          },
          {
            "name": "peak-burst",
            "peakMa": 1.5
          }
        ],
        "defaultMode": "active"
      }
    }
  },
  {
    "canonicalMpn": "BMP280",
    "manufacturerName": "Bosch Sensortec",
    "normalizedPartName": "BMP280 digital pressure sensor",
    "datasheetUrl": "https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmp280-ds001.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-complete",
    "aliasNames": [
      "GY-BMP280"
    ],
    "pinSchemaJson": {
      "package": "LGA-8",
      "pinCount": 8,
      "powerPins": [
        "VDD",
        "VDDIO"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "SCL",
        "SDA",
        "SDO",
        "CSB"
      ],
      "interfaces": [
        "I2C",
        "SPI"
      ]
    },
    "specsJson": {
      "category": "sensor",
      "summary": "저전력 디지털 기압 센서.",
      "supplyVoltage": {
        "min": 1.71,
        "typ": 3.3,
        "max": 3.6,
        "recommended": [
          3.3
        ]
      },
      "ioVoltage": {
        "min": 1.2,
        "max": 3.6,
        "nominal": [
          3.3
        ]
      },
      "interfaces": [
        "I2C",
        "SPI"
      ],
      "requiresExternalParts": [
        "0.1uF 디커플링 커패시터"
      ],
      "recommendedCircuit": [
        "I2C 주소 스트랩과 VDDIO 레벨 분리 확인"
      ],
      "validationHints": {
        "decoupling": {
          "minimumCapacitorCount": 1,
          "recommendedValues": [
            "0.1uF"
          ],
          "note": "VDD/VDDIO 근처 로컬 디커플링을 권장합니다."
        },
        "strapPins": [
          {
            "pinNames": [
              "SDO"
            ],
            "allowedReferences": [
              "power",
              "ground"
            ],
            "minimumCount": 1,
            "resistanceRangeOhms": [
              1000,
              100000
            ],
            "note": "BMP280의 SDO는 I2C 주소 선택 또는 SPI 데이터 출력 역할과 연결되므로 설계 의도에 맞는 기준 전위가 필요합니다."
          }
        ]
      },
      "tags": [
        "pressure",
        "bosch",
        "i2c",
        "spi"
      ],
      "currentConsumption": {
        "sleepUa": 0.1,
        "idleUa": 0.5,
        "measureUa": 650,
        "peakMa": 0.8,
        "notes": [
          "오버샘플링과 측정 속도에 따라 전류 상승"
        ],
        "typicalActiveUa": 650,
        "maxActiveUa": 650,
        "typicalPeakMa": 0.8,
        "maxPeakMa": 0.8,
        "moduleOverheadMa": 1.0,
        "modes": [
          {
            "name": "sleep",
            "currentUa": 0.1
          },
          {
            "name": "idle",
            "currentUa": 0.5
          },
          {
            "name": "active",
            "currentUa": 650
          },
          {
            "name": "peak-burst",
            "peakMa": 0.8
          }
        ],
        "defaultMode": "active"
      }
    }
  },
  {
    "canonicalMpn": "BME280",
    "manufacturerName": "Bosch Sensortec",
    "normalizedPartName": "BME280 humidity pressure temperature sensor",
    "datasheetUrl": "https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme280-ds002.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-complete",
    "aliasNames": [
      "GY-BME280"
    ],
    "pinSchemaJson": {
      "package": "LGA-8",
      "pinCount": 8,
      "powerPins": [
        "VDD",
        "VDDIO"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "SCL",
        "SDA",
        "SDO",
        "CSB"
      ],
      "interfaces": [
        "I2C",
        "SPI"
      ]
    },
    "specsJson": {
      "category": "sensor",
      "summary": "온도, 습도, 기압 통합 환경 센서.",
      "supplyVoltage": {
        "min": 1.71,
        "typ": 3.3,
        "max": 3.6,
        "recommended": [
          3.3
        ]
      },
      "ioVoltage": {
        "min": 1.2,
        "max": 3.6,
        "nominal": [
          3.3
        ]
      },
      "interfaces": [
        "I2C",
        "SPI"
      ],
      "requiresExternalParts": [
        "0.1uF 디커플링 커패시터"
      ],
      "recommendedCircuit": [
        "VDD와 VDDIO 모두 3.3V 계열인지 확인"
      ],
      "validationHints": {
        "decoupling": {
          "minimumCapacitorCount": 1,
          "recommendedValues": [
            "0.1uF"
          ],
          "note": "센서 전원 핀 가까이에 배치하는 편이 안전합니다."
        },
        "strapPins": [
          {
            "pinNames": [
              "SDO"
            ],
            "allowedReferences": [
              "power",
              "ground"
            ],
            "minimumCount": 1,
            "resistanceRangeOhms": [
              1000,
              100000
            ],
            "note": "BME280의 SDO는 I2C 주소 선택 또는 SPI SDO 역할과 연결되므로, 설계 의도에 맞는 기준 전위로 스트랩하는 편이 안전합니다."
          }
        ]
      },
      "tags": [
        "temperature",
        "humidity",
        "pressure",
        "bosch"
      ],
      "currentConsumption": {
        "sleepUa": 0.1,
        "idleUa": 0.6,
        "measureUa": 714,
        "peakMa": 0.9,
        "notes": [
          "습도와 압력 동시 측정 시 BMP280보다 소폭 증가"
        ],
        "typicalActiveUa": 714,
        "maxActiveUa": 714,
        "typicalPeakMa": 0.9,
        "maxPeakMa": 0.9,
        "moduleOverheadMa": 1.0,
        "modes": [
          {
            "name": "sleep",
            "currentUa": 0.1
          },
          {
            "name": "idle",
            "currentUa": 0.6
          },
          {
            "name": "active",
            "currentUa": 714
          },
          {
            "name": "peak-burst",
            "peakMa": 0.9
          }
        ],
        "defaultMode": "active"
      }
    }
  },
  {
    "canonicalMpn": "BME680",
    "manufacturerName": "Bosch Sensortec",
    "normalizedPartName": "BME680 gas pressure humidity temperature sensor",
    "datasheetUrl": "https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme680-ds001.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-complete",
    "aliasNames": [
      "CJMCU-680"
    ],
    "pinSchemaJson": {
      "package": "LGA-8",
      "pinCount": 8,
      "powerPins": [
        "VDD",
        "VDDIO"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "SCL",
        "SDA",
        "SDO",
        "CSB"
      ],
      "interfaces": [
        "I2C",
        "SPI"
      ]
    },
    "specsJson": {
      "category": "sensor",
      "summary": "VOC 추정이 가능한 환경 센서.",
      "supplyVoltage": {
        "min": 1.71,
        "typ": 3.3,
        "max": 3.6,
        "recommended": [
          3.3
        ]
      },
      "ioVoltage": {
        "min": 1.2,
        "max": 3.6,
        "nominal": [
          3.3
        ]
      },
      "interfaces": [
        "I2C",
        "SPI"
      ],
      "requiresExternalParts": [
        "0.1uF 디커플링 커패시터"
      ],
      "recommendedCircuit": [
        "히터 전류 예산과 환기 조건을 문서화"
      ],
      "validationHints": {
        "decoupling": {
          "minimumCapacitorCount": 1,
          "recommendedValues": [
            "0.1uF"
          ],
          "note": "센서 전원 핀 근처 디커플링과 히터 피크 전류를 함께 고려하세요."
        },
        "strapPins": [
          {
            "pinNames": [
              "SDO"
            ],
            "allowedReferences": [
              "power",
              "ground"
            ],
            "minimumCount": 1,
            "resistanceRangeOhms": [
              1000,
              100000
            ],
            "note": "BME680의 SDO는 I2C 주소 선택 또는 SPI SDO 역할과 연결되므로 기준 전위를 분명히 두는 편이 안전합니다."
          }
        ]
      },
      "tags": [
        "gas",
        "environment",
        "bosch"
      ],
      "currentConsumption": {
        "sleepUa": 0.15,
        "idleUa": 0.8,
        "measureUa": 2400,
        "peakMa": 12.0,
        "notes": [
          "가스 히터 활성화 시 피크 전류가 크게 증가",
          "히터 프로파일에 따라 수 mA~10mA대 변동"
        ],
        "typicalActiveUa": 2400,
        "maxActiveUa": 2400,
        "typicalPeakMa": 12.0,
        "maxPeakMa": 12.0,
        "moduleOverheadMa": 1.2,
        "modes": [
          {
            "name": "sleep",
            "currentUa": 0.15,
            "note": "heater off standby"
          },
          {
            "name": "ambient-measure",
            "currentUa": 2400,
            "note": "temperature humidity pressure sample"
          },
          {
            "name": "gas-heater-active",
            "peakMa": 12.0,
            "note": "VOC heater active burst"
          }
        ],
        "defaultMode": "ambient-measure"
      }
    }
  },
  {
    "canonicalMpn": "DS18B20",
    "manufacturerName": "Analog Devices",
    "normalizedPartName": "DS18B20 1-Wire digital thermometer",
    "datasheetUrl": "https://www.analog.com/media/en/technical-documentation/data-sheets/ds18b20.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-complete",
    "aliasNames": [
      "DS18B20-MODULE"
    ],
    "pinSchemaJson": {
      "package": "TO-92",
      "pinCount": 3,
      "powerPins": [
        "VDD"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "DQ"
      ],
      "interfaces": [
        "ONEWIRE"
      ]
    },
    "specsJson": {
      "category": "sensor",
      "summary": "1-Wire 방식 디지털 온도 센서.",
      "supplyVoltage": {
        "min": 3.0,
        "typ": 5,
        "max": 5.5,
        "recommended": [
          5,
          3.3
        ]
      },
      "ioVoltage": {
        "nominal": [
          5,
          3.3
        ]
      },
      "interfaces": [
        "ONEWIRE"
      ],
      "requiresExternalParts": [
        "4.7kΩ 수준 데이터 라인 풀업"
      ],
      "recommendedCircuit": [
        "긴 배선이면 기생전원 대신 3선식 우선",
        "복수 센서 버스는 스타 배선보다 짧은 메인 버스 + 짧은 스텁 구조가 유리"
      ],
      "validationHints": {
        "biasResistors": [
          {
            "pinNames": [
              "DQ",
              "DATA"
            ],
            "kind": "pull-up",
            "minimumCount": 1,
            "resistanceRangeOhms": [
              3300,
              10000
            ],
            "reason": "onewire-data",
            "note": "1-Wire 데이터 라인은 보통 4.7kΩ 전후 풀업으로 시작합니다."
          }
        ],
        "decoupling": {
          "minimumCapacitorCount": 1,
          "recommendedValues": [
            "0.1uF"
          ],
          "note": "3선식 VDD 구동이면 센서 가까운 곳의 로컬 디커플링이 도움이 됩니다."
        }
      },
      "tags": [
        "temperature",
        "onewire"
      ],
      "currentConsumption": {
        "sleepUa": 1,
        "measureUa": 1500,
        "peakMa": 1.5,
        "notes": [
          "온도 변환 중 약 1.5mA 수준",
          "기생전원 모드는 배선 조건에 더 민감"
        ],
        "typicalActiveUa": 1500,
        "maxActiveUa": 1500,
        "typicalPeakMa": 1.5,
        "maxPeakMa": 1.5,
        "moduleOverheadMa": 0.2,
        "modes": [
          {
            "name": "sleep",
            "currentUa": 1
          },
          {
            "name": "active",
            "currentUa": 1500
          },
          {
            "name": "peak-burst",
            "peakMa": 1.5
          }
        ],
        "defaultMode": "active"
      }
    }
  },
  {
    "canonicalMpn": "LM35",
    "manufacturerName": "Texas Instruments",
    "normalizedPartName": "LM35 analog temperature sensor",
    "datasheetUrl": "https://www.ti.com/lit/gpn/lm35",
    "lifecycleStatus": "active",
    "sourceQuality": "official-complete",
    "pinSchemaJson": {
      "package": "TO-92",
      "pinCount": 3,
      "powerPins": [
        "VS"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "VOUT"
      ],
      "interfaces": [
        "ADC"
      ]
    },
    "specsJson": {
      "category": "sensor",
      "summary": "섭씨 온도에 비례한 전압을 출력하는 아날로그 온도 센서.",
      "supplyVoltage": {
        "min": 4,
        "typ": 5,
        "max": 30,
        "recommended": [
          5
        ]
      },
      "ioVoltage": {
        "nominal": [
          5
        ]
      },
      "absoluteMax": {
        "supplyVoltageMax": 35
      },
      "interfaces": [
        "ADC"
      ],
      "requiresExternalParts": [
        "ADC 레퍼런스 정합"
      ],
      "recommendedCircuit": [
        "아날로그 라인 노이즈 필터링 고려"
      ],
      "tags": [
        "temperature",
        "analog",
        "ti"
      ],
      "currentConsumption": {
        "idleUa": 60,
        "measureUa": 60,
        "peakMa": 0.06,
        "notes": [
          "아날로그 센서라 사실상 연속 소비",
          "ADC 샘플링 자체는 MCU 전력에 포함"
        ],
        "typicalActiveUa": 60,
        "maxActiveUa": 60,
        "typicalPeakMa": 0.06,
        "maxPeakMa": 0.06,
        "moduleOverheadMa": 0.0,
        "modes": [
          {
            "name": "idle",
            "currentUa": 60
          },
          {
            "name": "active",
            "currentUa": 60
          },
          {
            "name": "peak-burst",
            "peakMa": 0.06
          }
        ],
        "defaultMode": "active"
      }
    }
  },
  {
    "canonicalMpn": "TMP36GT9Z",
    "manufacturerName": "Analog Devices",
    "normalizedPartName": "TMP36 low voltage analog temperature sensor",
    "datasheetUrl": "https://www.analog.com/media/en/technical-documentation/data-sheets/TMP35_36_37.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-complete",
    "pinSchemaJson": {
      "package": "TO-92",
      "pinCount": 3,
      "powerPins": [
        "VS"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "VOUT"
      ],
      "interfaces": [
        "ADC"
      ]
    },
    "specsJson": {
      "category": "sensor",
      "summary": "저전압 동작이 가능한 아날로그 온도 센서.",
      "supplyVoltage": {
        "min": 2.7,
        "typ": 3.3,
        "max": 5.5,
        "recommended": [
          3.3,
          5
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3,
          5
        ]
      },
      "interfaces": [
        "ADC"
      ],
      "requiresExternalParts": [
        "ADC 레퍼런스 정합"
      ],
      "recommendedCircuit": [
        "0.1uF 바이패스와 ADC 입력 안정화 고려"
      ],
      "tags": [
        "temperature",
        "analog"
      ],
      "currentConsumption": {
        "idleUa": 50,
        "measureUa": 50,
        "peakMa": 0.05,
        "notes": [
          "정지 모드 없이 연속 소비형 아날로그 온도 센서"
        ],
        "typicalActiveUa": 50,
        "maxActiveUa": 50,
        "typicalPeakMa": 0.05,
        "maxPeakMa": 0.05,
        "moduleOverheadMa": 0.0,
        "modes": [
          {
            "name": "idle",
            "currentUa": 50
          },
          {
            "name": "active",
            "currentUa": 50
          },
          {
            "name": "peak-burst",
            "peakMa": 0.05
          }
        ],
        "defaultMode": "active"
      }
    }
  },
  {
    "canonicalMpn": "MAX31855KASA+T",
    "manufacturerName": "Analog Devices",
    "normalizedPartName": "MAX31855 thermocouple to digital converter",
    "datasheetUrl": "https://www.analog.com/en/products/max31855.html",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "pinSchemaJson": {
      "package": "SOIC-8",
      "pinCount": 8,
      "powerPins": [
        "VCC"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "SCK",
        "CS",
        "SO",
        "T+",
        "T-"
      ],
      "interfaces": [
        "SPI"
      ]
    },
    "specsJson": {
      "category": "sensor",
      "summary": "K 타입 열전대용 디지털 변환 IC.",
      "supplyVoltage": {
        "min": 3.0,
        "typ": 3.3,
        "max": 3.6,
        "recommended": [
          3.3
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3
        ]
      },
      "interfaces": [
        "SPI"
      ],
      "requiresExternalParts": [
        "K 타입 열전대",
        "0.1uF 디커플링 커패시터"
      ],
      "recommendedCircuit": [
        "열전대 극성과 냉접점 위치를 명확히 유지"
      ],
      "tags": [
        "thermocouple",
        "spi"
      ],
      "currentConsumption": {
        "idleUa": 1500,
        "measureUa": 1500,
        "peakMa": 1.5,
        "notes": [
          "열전대 프런트엔드 IC라 지속 동작 전류 중심"
        ],
        "typicalActiveUa": 1500,
        "maxActiveUa": 1500,
        "typicalPeakMa": 1.5,
        "maxPeakMa": 1.5,
        "moduleOverheadMa": 0.5,
        "modes": [
          {
            "name": "idle",
            "currentUa": 1500
          },
          {
            "name": "active",
            "currentUa": 1500
          },
          {
            "name": "peak-burst",
            "peakMa": 1.5
          }
        ],
        "defaultMode": "active"
      }
    }
  },
  {
    "canonicalMpn": "MAX6675ISA+T",
    "manufacturerName": "Analog Devices",
    "normalizedPartName": "MAX6675 cold-junction-compensated thermocouple converter",
    "datasheetUrl": "https://www.analog.com/en/products/max6675.html",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "pinSchemaJson": {
      "package": "SOIC-8",
      "pinCount": 8,
      "powerPins": [
        "VCC"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "SCK",
        "CS",
        "SO",
        "T+",
        "T-"
      ],
      "interfaces": [
        "SPI"
      ]
    },
    "specsJson": {
      "category": "sensor",
      "summary": "열전대 입력을 읽는 고온 측정용 SPI IC.",
      "supplyVoltage": {
        "min": 3.0,
        "typ": 5,
        "max": 5.5,
        "recommended": [
          5
        ]
      },
      "ioVoltage": {
        "nominal": [
          5
        ]
      },
      "interfaces": [
        "SPI"
      ],
      "requiresExternalParts": [
        "K 타입 열전대",
        "0.1uF 디커플링 커패시터"
      ],
      "recommendedCircuit": [
        "3.3V MCU 직결 시 레벨 정합 확인"
      ],
      "tags": [
        "thermocouple",
        "spi"
      ],
      "currentConsumption": {
        "idleUa": 1500,
        "measureUa": 1500,
        "peakMa": 1.5,
        "notes": [
          "5V 구동 시 보드 전류 여유 고려"
        ],
        "typicalActiveUa": 1500,
        "maxActiveUa": 1500,
        "typicalPeakMa": 1.5,
        "maxPeakMa": 1.5,
        "moduleOverheadMa": 0.5,
        "modes": [
          {
            "name": "idle",
            "currentUa": 1500
          },
          {
            "name": "active",
            "currentUa": 1500
          },
          {
            "name": "peak-burst",
            "peakMa": 1.5
          }
        ],
        "defaultMode": "active"
      }
    }
  },
  {
    "canonicalMpn": "VL53L0X",
    "manufacturerName": "STMicroelectronics",
    "normalizedPartName": "VL53L0X time-of-flight ranging sensor",
    "datasheetUrl": "https://www.st.com/resource/en/datasheet/vl53l0x.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "pinSchemaJson": {
      "package": "LGA-12",
      "pinCount": 12,
      "powerPins": [
        "AVDD",
        "IOVDD"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "SCL",
        "SDA",
        "GPIO1",
        "XSHUT"
      ],
      "interfaces": [
        "I2C"
      ]
    },
    "specsJson": {
      "category": "sensor",
      "summary": "근거리 ToF 레이저 거리 센서.",
      "supplyVoltage": {
        "min": 2.6,
        "typ": 2.8,
        "max": 3.5,
        "recommended": [
          2.8,
          3.3
        ]
      },
      "ioVoltage": {
        "nominal": [
          2.8,
          3.3
        ]
      },
      "interfaces": [
        "I2C"
      ],
      "requiresExternalParts": [
        "I2C 풀업 저항",
        "0.1uF 디커플링 커패시터"
      ],
      "recommendedCircuit": [
        "브레이크아웃이면 레벨시프터 내장 여부 구분"
      ],
      "tags": [
        "tof",
        "distance",
        "st"
      ],
      "currentConsumption": {
        "sleepUa": 5,
        "idleUa": 5000,
        "measureUa": 19000,
        "peakMa": 40.0,
        "notes": [
          "ranging 중 전류 상승",
          "브레이크아웃 레귤레이터와 LED가 있으면 보드 전류는 더 커질 수 있음"
        ],
        "typicalActiveUa": 19000,
        "maxActiveUa": 19000,
        "typicalPeakMa": 40.0,
        "maxPeakMa": 40.0,
        "moduleOverheadMa": 2.0,
        "modes": [
          {
            "name": "soft-sleep",
            "currentUa": 5
          },
          {
            "name": "idle",
            "currentUa": 5000
          },
          {
            "name": "ranging",
            "currentUa": 19000,
            "peakMa": 40.0
          }
        ],
        "defaultMode": "ranging"
      }
    }
  },
  {
    "canonicalMpn": "VL53L1X",
    "manufacturerName": "STMicroelectronics",
    "normalizedPartName": "VL53L1X long distance time-of-flight sensor",
    "datasheetUrl": "https://www.st.com/resource/en/datasheet/vl53l1x.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "pinSchemaJson": {
      "package": "LGA-12",
      "pinCount": 12,
      "powerPins": [
        "AVDD",
        "IOVDD"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "SCL",
        "SDA",
        "GPIO1",
        "XSHUT"
      ],
      "interfaces": [
        "I2C"
      ]
    },
    "specsJson": {
      "category": "sensor",
      "summary": "장거리 ToF 레이저 거리 센서.",
      "supplyVoltage": {
        "min": 2.6,
        "typ": 2.8,
        "max": 3.5,
        "recommended": [
          2.8,
          3.3
        ]
      },
      "ioVoltage": {
        "nominal": [
          2.8,
          3.3
        ]
      },
      "interfaces": [
        "I2C"
      ],
      "requiresExternalParts": [
        "I2C 풀업 저항",
        "0.1uF 디커플링 커패시터"
      ],
      "recommendedCircuit": [
        "광학 창 주변 오염과 차광 조건 고려"
      ],
      "tags": [
        "tof",
        "distance",
        "st"
      ],
      "currentConsumption": {
        "sleepUa": 5,
        "idleUa": 5000,
        "measureUa": 20000,
        "peakMa": 40.0,
        "notes": [
          "장거리 ranging 설정일수록 에너지 소모 증가 가능"
        ],
        "typicalActiveUa": 20000,
        "maxActiveUa": 20000,
        "typicalPeakMa": 40.0,
        "maxPeakMa": 40.0,
        "moduleOverheadMa": 2.0,
        "modes": [
          {
            "name": "soft-sleep",
            "currentUa": 5
          },
          {
            "name": "idle",
            "currentUa": 5000
          },
          {
            "name": "ranging-long",
            "currentUa": 20000,
            "peakMa": 40.0
          }
        ],
        "defaultMode": "ranging-long"
      }
    }
  },
  {
    "canonicalMpn": "MPU-6050",
    "manufacturerName": "TDK InvenSense",
    "normalizedPartName": "MPU-6050 6-axis motion tracking device",
    "datasheetUrl": "https://wiki.dfrobot.com/SEN0142",
    "lifecycleStatus": "active",
    "sourceQuality": "module-verified",
    "aliasNames": [
      "GY-521",
      "MPU6050"
    ],
    "supportingUrls": [
      "https://wiki.keyestudio.com/Ks0170_keyestudio_MPU6050_Gyroscope_and_Accelerometer_module"
    ],
    "pinSchemaJson": {
      "package": "Module",
      "powerPins": [
        "VCC",
        "3V3"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "SCL",
        "SDA",
        "INT",
        "AD0",
        "XDA",
        "XCL"
      ],
      "interfaces": [
        "I2C"
      ]
    },
    "specsJson": {
      "category": "sensor",
      "summary": "6축 가속도 자이로 센서 모듈.",
      "supplyVoltage": {
        "min": 2.375,
        "typ": 3.3,
        "max": 5,
        "recommended": [
          3.3
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3
        ]
      },
      "interfaces": [
        "I2C"
      ],
      "requiresExternalParts": [
        "I2C 풀업 저항"
      ],
      "recommendedCircuit": [
        "GY-521류는 보드 레벨시프터 포함 여부 확인"
      ],
      "tags": [
        "imu",
        "i2c",
        "module"
      ],
      "currentConsumption": {
        "sleepUa": 5,
        "idleUa": 500,
        "measureUa": 3900,
        "peakMa": 4.0,
        "notes": [
          "가속도+자이로 동시 활성 시 mA 단위",
          "브레이크아웃의 전원 LED는 별도"
        ],
        "typicalActiveUa": 3900,
        "maxActiveUa": 3900,
        "typicalPeakMa": 4.0,
        "maxPeakMa": 4.0,
        "moduleOverheadMa": 1.5,
        "modes": [
          {
            "name": "sleep",
            "currentUa": 5
          },
          {
            "name": "idle",
            "currentUa": 500
          },
          {
            "name": "active",
            "currentUa": 3900
          },
          {
            "name": "peak-burst",
            "peakMa": 4.0
          }
        ],
        "defaultMode": "active"
      }
    }
  },
  {
    "canonicalMpn": "MPU-9250",
    "manufacturerName": "TDK InvenSense",
    "normalizedPartName": "MPU-9250 9-axis motion tracking device",
    "datasheetUrl": "https://learn.sparkfun.com/tutorials/mpu-9250-hookup-guide/all",
    "lifecycleStatus": "active",
    "sourceQuality": "module-verified",
    "aliasNames": [
      "MPU9250",
      "GY-91"
    ],
    "pinSchemaJson": {
      "package": "Module",
      "powerPins": [
        "VCC",
        "3V3"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "SCL",
        "SDA",
        "NCS",
        "INT",
        "FSYNC"
      ],
      "interfaces": [
        "I2C",
        "SPI"
      ]
    },
    "specsJson": {
      "category": "sensor",
      "summary": "9축 IMU 모듈.",
      "supplyVoltage": {
        "min": 2.4,
        "typ": 3.3,
        "max": 3.6,
        "recommended": [
          3.3
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3
        ]
      },
      "interfaces": [
        "I2C",
        "SPI"
      ],
      "requiresExternalParts": [
        "I2C 풀업 저항 또는 SPI CS 연결"
      ],
      "recommendedCircuit": [
        "클론 10DOF 보드는 BMP280 동반 탑재 여부 분리"
      ],
      "tags": [
        "imu",
        "i2c",
        "spi",
        "module"
      ],
      "currentConsumption": {
        "sleepUa": 8,
        "idleUa": 450,
        "measureUa": 3700,
        "peakMa": 4.0,
        "notes": [
          "자력계 포함 9축 동작 기준",
          "DMP/샘플링 속도에 따라 달라짐"
        ],
        "typicalActiveUa": 3700,
        "maxActiveUa": 3700,
        "typicalPeakMa": 4.0,
        "maxPeakMa": 4.0,
        "moduleOverheadMa": 1.5,
        "modes": [
          {
            "name": "sleep",
            "currentUa": 8
          },
          {
            "name": "idle",
            "currentUa": 450
          },
          {
            "name": "active",
            "currentUa": 3700
          },
          {
            "name": "peak-burst",
            "peakMa": 4.0
          }
        ],
        "defaultMode": "active"
      }
    }
  },
  {
    "canonicalMpn": "ADXL345BCCZ",
    "manufacturerName": "Analog Devices",
    "normalizedPartName": "ADXL345 3-axis digital accelerometer",
    "datasheetUrl": "https://www.analog.com/media/en/technical-documentation/data-sheets/adxl345.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "pinSchemaJson": {
      "package": "LGA-14",
      "pinCount": 14,
      "powerPins": [
        "VS",
        "VDDIO"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "SCL/SCLK",
        "SDA/SDI/SDIO",
        "CS",
        "INT1",
        "INT2"
      ],
      "interfaces": [
        "I2C",
        "SPI"
      ]
    },
    "specsJson": {
      "category": "sensor",
      "summary": "저전력 3축 디지털 가속도 센서.",
      "supplyVoltage": {
        "min": 2.0,
        "typ": 3.3,
        "max": 3.6,
        "recommended": [
          3.3
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3
        ]
      },
      "interfaces": [
        "I2C",
        "SPI"
      ],
      "requiresExternalParts": [
        "0.1uF 디커플링 커패시터"
      ],
      "recommendedCircuit": [
        "VDDIO와 MCU IO 레벨 일치 확인"
      ],
      "tags": [
        "accelerometer",
        "i2c",
        "spi"
      ],
      "currentConsumption": {
        "sleepUa": 0.1,
        "idleUa": 23,
        "measureUa": 140,
        "peakMa": 0.2,
        "notes": [
          "출력 데이터율이 높을수록 전류 증가"
        ],
        "typicalActiveUa": 140,
        "maxActiveUa": 140,
        "typicalPeakMa": 0.2,
        "maxPeakMa": 0.2,
        "moduleOverheadMa": 0.6,
        "modes": [
          {
            "name": "sleep",
            "currentUa": 0.1
          },
          {
            "name": "idle",
            "currentUa": 23
          },
          {
            "name": "active",
            "currentUa": 140
          },
          {
            "name": "peak-burst",
            "peakMa": 0.2
          }
        ],
        "defaultMode": "active"
      }
    }
  },
  {
    "canonicalMpn": "BH1750FVI",
    "manufacturerName": "ROHM Semiconductor",
    "normalizedPartName": "BH1750 digital ambient light sensor",
    "datasheetUrl": "https://www.rohm.com/products/sensors-mems/ambient-light-sensor-ics/digital-16bit-serial-output",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "GY-30",
      "GY-302",
      "BH1750"
    ],
    "supportingUrls": [
      "https://www.mouser.com/datasheet/2/348/bh1750fvi-e-186247.pdf",
      "https://wiki.keyestudio.com/Ks0278_keyestudio_BH1750FVI_Digital_Light_Intensity_Module"
    ],
    "pinSchemaJson": {
      "package": "Module",
      "powerPins": [
        "VCC",
        "VIN",
        "3V3"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "SCL",
        "SDA",
        "ADDR"
      ],
      "interfaces": [
        "I2C"
      ]
    },
    "specsJson": {
      "category": "sensor",
      "summary": "Lux 단위 조도 측정용 디지털 센서 모듈.",
      "supplyVoltage": {
        "min": 2.4,
        "typ": 3.3,
        "max": 5,
        "recommended": [
          3.3
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3
        ]
      },
      "interfaces": [
        "I2C"
      ],
      "requiresExternalParts": [
        "I2C 풀업 저항"
      ],
      "recommendedCircuit": [
        "브레이크아웃의 전원 입력과 칩 코어 전압 구분",
        "ADDR 상태를 설계 문서에 남겨 I2C 주소 충돌을 피하는 편이 좋음"
      ],
      "validationHints": {
        "decoupling": {
          "minimumCapacitorCount": 1,
          "recommendedValues": [
            "0.1uF"
          ],
          "note": "브레이크아웃이면 전원 입력 근처 바이패스 유무를 확인하세요."
        },
        "strapPins": [
          {
            "pinNames": [
              "ADDR"
            ],
            "allowedReferences": [
              "power",
              "ground"
            ],
            "minimumCount": 1,
            "resistanceRangeOhms": [
              1000,
              100000
            ],
            "note": "BH1750의 ADDR은 I2C 주소 선택에 사용되므로 복수 센서 구성에서는 기준 전위를 명확히 하는 편이 안전합니다."
          }
        ]
      },
      "tags": [
        "light",
        "i2c",
        "module"
      ],
      "currentConsumption": {
        "sleepUa": 0.01,
        "idleUa": 0.12,
        "measureUa": 120,
        "peakMa": 0.19,
        "notes": [
          "측정 시간과 해상도에 따라 차이"
        ],
        "typicalActiveUa": 120,
        "maxActiveUa": 120,
        "typicalPeakMa": 0.19,
        "maxPeakMa": 0.19,
        "moduleOverheadMa": 0.8,
        "modes": [
          {
            "name": "sleep",
            "currentUa": 0.01
          },
          {
            "name": "idle",
            "currentUa": 0.12
          },
          {
            "name": "active",
            "currentUa": 120
          },
          {
            "name": "peak-burst",
            "peakMa": 0.19
          }
        ],
        "defaultMode": "active"
      }
    }
  },
  {
    "canonicalMpn": "MAX30102",
    "manufacturerName": "Analog Devices",
    "normalizedPartName": "MAX30102 pulse oximeter and heart-rate sensor",
    "datasheetUrl": "https://www.analog.com/media/en/technical-documentation/data-sheets/MAX30102.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "GY-MAX30102"
    ],
    "supportingUrls": [
      "https://wiki.keyestudio.com/KS0462_Keyestudio_MAX30102_Heart_Rate_Sensor"
    ],
    "pinSchemaJson": {
      "package": "OLGA-14",
      "pinCount": 14,
      "powerPins": [
        "VDD",
        "VLED"
      ],
      "groundPins": [
        "GND",
        "PGND"
      ],
      "signalPins": [
        "SCL",
        "SDA",
        "INT"
      ],
      "interfaces": [
        "I2C"
      ]
    },
    "specsJson": {
      "category": "sensor",
      "summary": "심박수 및 SpO2 측정용 광학 센서.",
      "supplyVoltage": {
        "min": 1.8,
        "typ": 3.3,
        "max": 5,
        "recommended": [
          3.3
        ]
      },
      "ioVoltage": {
        "nominal": [
          1.8,
          3.3
        ]
      },
      "interfaces": [
        "I2C"
      ],
      "requiresExternalParts": [
        "0.1uF 디커플링 커패시터"
      ],
      "recommendedCircuit": [
        "LED 전원과 로직 전원 경로를 분리 검토"
      ],
      "tags": [
        "biometric",
        "i2c"
      ],
      "currentConsumption": {
        "sleepUa": 0.7,
        "idleUa": 600,
        "measureUa": 1000,
        "peakMa": 50.0,
        "notes": [
          "LED 펄스 전류 설정에 따라 피크 전류가 크게 변함",
          "보드 전원 설계에서는 LED 피크를 우선 고려"
        ],
        "typicalActiveUa": 1000,
        "maxActiveUa": 1000,
        "typicalPeakMa": 50.0,
        "maxPeakMa": 50.0,
        "moduleOverheadMa": 1.2,
        "modes": [
          {
            "name": "sleep",
            "currentUa": 0.7
          },
          {
            "name": "idle",
            "currentUa": 600
          },
          {
            "name": "sample-led-low",
            "currentUa": 1000,
            "note": "low LED pulse settings"
          },
          {
            "name": "sample-led-high",
            "peakMa": 50.0,
            "note": "high LED pulse current burst"
          }
        ],
        "defaultMode": "sample-led-low"
      }
    }
  },
  {
    "canonicalMpn": "AD8232ACPZ-R7",
    "manufacturerName": "Analog Devices",
    "normalizedPartName": "AD8232 single lead heart rate monitor front end",
    "datasheetUrl": "https://www.analog.com/media/en/technical-documentation/data-sheets/AD8232.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "pinSchemaJson": {
      "package": "LFCSP-20",
      "pinCount": 20,
      "powerPins": [
        "VS"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "OUT",
        "LO+",
        "LO-",
        "SDN"
      ],
      "interfaces": [
        "ADC"
      ]
    },
    "specsJson": {
      "category": "analog-front-end",
      "summary": "ECG 신호 측정용 아날로그 프런트엔드 IC.",
      "supplyVoltage": {
        "min": 2.0,
        "typ": 3.3,
        "max": 3.5,
        "recommended": [
          3.3
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3
        ]
      },
      "interfaces": [
        "ADC"
      ],
      "requiresExternalParts": [
        "전극",
        "외부 필터 수동소자",
        "RLD 회로"
      ],
      "recommendedCircuit": [
        "인체 접촉 회로 절연과 보호 회로를 별도 검토"
      ],
      "tags": [
        "ecg",
        "analog-front-end"
      ],
      "currentConsumption": {
        "sleepUa": 0.08,
        "idleUa": 170,
        "measureUa": 170,
        "peakMa": 0.2,
        "notes": [
          "AFE 본체 기준",
          "전극 바이어스 및 외부 필터는 별도 전력 영향 거의 없음"
        ],
        "typicalActiveUa": 170,
        "maxActiveUa": 170,
        "typicalPeakMa": 0.2,
        "maxPeakMa": 0.2,
        "moduleOverheadMa": 0.8,
        "modes": [
          {
            "name": "sleep",
            "currentUa": 0.08
          },
          {
            "name": "idle",
            "currentUa": 170
          },
          {
            "name": "active",
            "currentUa": 170
          },
          {
            "name": "peak-burst",
            "peakMa": 0.2
          }
        ],
        "defaultMode": "active"
      }
    }
  },
  {
    "canonicalMpn": "INA219AIDCNR",
    "manufacturerName": "Texas Instruments",
    "normalizedPartName": "INA219 current and power monitor",
    "datasheetUrl": "https://www.ti.com/lit/ds/symlink/ina219.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-complete",
    "pinSchemaJson": {
      "package": "SOT-23-8",
      "pinCount": 8,
      "powerPins": [
        "VS"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "SCL",
        "SDA",
        "A0",
        "A1",
        "VIN+",
        "VIN-"
      ],
      "interfaces": [
        "I2C"
      ]
    },
    "specsJson": {
      "category": "power-monitor",
      "summary": "양방향 전류 및 전력 측정용 I2C 모니터 IC.",
      "supplyVoltage": {
        "min": 3.0,
        "typ": 3.3,
        "max": 5.5,
        "recommended": [
          3.3,
          5
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3,
          5
        ]
      },
      "interfaces": [
        "I2C"
      ],
      "requiresExternalParts": [
        "샌스 저항",
        "I2C 풀업 저항",
        "0.1uF 디커플링 커패시터"
      ],
      "recommendedCircuit": [
        "샌스 저항 전력 등급과 버스 전압 범위 확인"
      ],
      "tags": [
        "current",
        "power",
        "monitor",
        "i2c"
      ],
      "currentConsumption": {
        "sleepUa": 40,
        "idleUa": 700,
        "measureUa": 1000,
        "peakMa": 1.0,
        "notes": [
          "샌스 저항 손실은 별도 계산이 필요",
          "측정 대상 부하 전류와 혼동하지 않도록 주의"
        ],
        "typicalActiveUa": 1000,
        "maxActiveUa": 1000,
        "typicalPeakMa": 1.0,
        "maxPeakMa": 1.0,
        "moduleOverheadMa": 1.0,
        "modes": [
          {
            "name": "sleep",
            "currentUa": 40
          },
          {
            "name": "idle",
            "currentUa": 700
          },
          {
            "name": "active",
            "currentUa": 1000
          },
          {
            "name": "peak-burst",
            "peakMa": 1.0
          }
        ],
        "defaultMode": "active"
      }
    }
  },
  {
    "canonicalMpn": "INA226AIDGST",
    "manufacturerName": "Texas Instruments",
    "normalizedPartName": "INA226 current voltage and power monitor",
    "datasheetUrl": "https://www.ti.com/product/INA226",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "pinSchemaJson": {
      "package": "VSSOP-10",
      "pinCount": 10,
      "powerPins": [
        "VS"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "SCL",
        "SDA",
        "A0",
        "A1",
        "ALERT",
        "VIN+",
        "VIN-"
      ],
      "interfaces": [
        "I2C"
      ]
    },
    "specsJson": {
      "category": "power-monitor",
      "summary": "고정밀 전류, 전압, 전력 모니터 IC.",
      "supplyVoltage": {
        "min": 2.7,
        "typ": 3.3,
        "max": 5.5,
        "recommended": [
          3.3,
          5
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3,
          5
        ]
      },
      "interfaces": [
        "I2C"
      ],
      "requiresExternalParts": [
        "샌스 저항",
        "I2C 풀업 저항",
        "0.1uF 디커플링 커패시터"
      ],
      "recommendedCircuit": [
        "ALERT 사용 시 임계치 설정과 샌스 저항 정밀도 확보"
      ],
      "tags": [
        "current",
        "power",
        "monitor",
        "i2c"
      ],
      "currentConsumption": {
        "sleepUa": 2,
        "idleUa": 330,
        "measureUa": 420,
        "peakMa": 0.5,
        "notes": [
          "샌스 저항에서 발생하는 전력 손실은 sensors own current와 별도"
        ],
        "typicalActiveUa": 420,
        "maxActiveUa": 420,
        "typicalPeakMa": 0.5,
        "maxPeakMa": 0.5,
        "moduleOverheadMa": 0.8,
        "modes": [
          {
            "name": "sleep",
            "currentUa": 2
          },
          {
            "name": "idle",
            "currentUa": 330
          },
          {
            "name": "active",
            "currentUa": 420
          },
          {
            "name": "peak-burst",
            "peakMa": 0.5
          }
        ],
        "defaultMode": "active"
      }
    }
  },
  {
    "canonicalMpn": "DS3231SN#",
    "manufacturerName": "Analog Devices",
    "normalizedPartName": "DS3231 temperature compensated RTC",
    "datasheetUrl": "https://www.analog.com/media/en/technical-documentation/data-sheets/ds3231.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-complete",
    "pinSchemaJson": {
      "package": "SOIC-16",
      "pinCount": 16,
      "powerPins": [
        "VCC",
        "VBAT"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "SCL",
        "SDA",
        "32KHZ",
        "INT/SQW"
      ],
      "interfaces": [
        "I2C"
      ]
    },
    "specsJson": {
      "category": "timing",
      "summary": "TCXO 내장 고정밀 I2C RTC.",
      "supplyVoltage": {
        "min": 2.3,
        "typ": 3.3,
        "max": 5.5,
        "recommended": [
          3.3,
          5
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3,
          5
        ]
      },
      "interfaces": [
        "I2C"
      ],
      "validationHints": {
        "decoupling": {
          "minimumCapacitorCount": 1,
          "recommendedValues": [
            "0.1uF"
          ],
          "note": "VCC 근처 로컬 디커플링과 VBAT 백업 소스 안정성을 같이 보는 편이 좋습니다."
        }
      },
      "requiresExternalParts": [
        "백업 배터리 또는 슈퍼캡"
      ],
      "recommendedCircuit": [
        "VBAT 역삽입 방지와 풀업 전압 레벨 일치 확인",
        "코인셀 사용 시 충전 불가 배터리에 외부 충전 경로가 생기지 않도록 확인"
      ],
      "tags": [
        "rtc",
        "i2c",
        "timing"
      ],
      "currentConsumption": {
        "sleepUa": 3,
        "idleUa": 110,
        "measureUa": 110,
        "peakMa": 0.2,
        "notes": [
          "VBAT 백업 모드에서는 수 uA 수준",
          "32kHz 출력 사용 시 추가 소모 가능"
        ],
        "typicalActiveUa": 110,
        "maxActiveUa": 110,
        "typicalPeakMa": 0.2,
        "maxPeakMa": 0.2,
        "moduleOverheadMa": 0.4,
        "modes": [
          {
            "name": "sleep",
            "currentUa": 3
          },
          {
            "name": "idle",
            "currentUa": 110
          },
          {
            "name": "active",
            "currentUa": 110
          },
          {
            "name": "peak-burst",
            "peakMa": 0.2
          }
        ],
        "defaultMode": "idle"
      }
    }
  },
  {
    "canonicalMpn": "LM324",
    "manufacturerName": "Texas Instruments",
    "normalizedPartName": "LM324 quad operational amplifier",
    "datasheetUrl": "https://www.ti.com/lit/gpn/lm324",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "LM324N",
      "LM324D"
    ],
    "pinSchemaJson": {
      "package": "DIP-14 / SOIC-14",
      "pinCount": 14,
      "powerPins": [
        "VCC",
        "V+"
      ],
      "groundPins": [
        "GND",
        "V-"
      ],
      "signalPins": [
        "OUT1",
        "IN1-",
        "IN1+",
        "IN2+",
        "IN2-",
        "OUT2",
        "OUT3",
        "IN3-",
        "IN3+",
        "IN4+",
        "IN4-",
        "OUT4"
      ],
      "interfaces": [
        "ANALOG"
      ]
    },
    "specsJson": {
      "category": "analog-front-end",
      "summary": "범용 쿼드 OP-Amp. 단일 전원 센서 프런트엔드에서 흔하지만 rail-to-rail 출력은 아닙니다.",
      "supplyVoltage": {
        "min": 3.0,
        "typ": 5,
        "max": 32,
        "recommended": [
          5,
          12
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3,
          5
        ]
      },
      "absoluteMax": {
        "supplyVoltageMax": 32
      },
      "interfaces": [
        "ANALOG"
      ],
      "currentConsumption": {
        "idleUa": 700,
        "typicalActiveUa": 700,
        "maxActiveUa": 1400,
        "defaultMode": "active"
      },
      "analogCharacteristics": {
        "gainBandwidthHz": 1000000,
        "railToRailInput": false,
        "railToRailOutput": false,
        "inputCommonModeIncludesGround": true,
        "note": "상단 입력 공통모드와 출력 스윙 headroom이 필요해 3.3V 단일 전원 고진폭 용도에는 제약이 있습니다."
      },
      "validationHints": {
        "decoupling": {
          "minimumCapacitorCount": 1,
          "recommendedValues": [
            "0.1uF"
          ]
        }
      },
      "recommendedCircuit": [
        "중간 바이어스와 출력 상단 headroom 확인",
        "ADC 기준전압을 넘지 않는지 확인",
        "폐루프 이득 대비 GBW 여유 검토"
      ],
      "tags": [
        "opamp",
        "analog",
        "lm324"
      ]
    }
  },
  {
    "canonicalMpn": "TLV2372IDR",
    "manufacturerName": "Texas Instruments",
    "normalizedPartName": "TLV2372 rail-to-rail dual operational amplifier",
    "datasheetUrl": "https://www.ti.com/lit/gpn/tlv2372",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "TLV2372",
      "TLV2372IP",
      "TLV2372IN"
    ],
    "pinSchemaJson": {
      "package": "SOIC-8 / DIP-8",
      "pinCount": 8,
      "powerPins": [
        "VDD",
        "V+"
      ],
      "groundPins": [
        "VSS",
        "V-"
      ],
      "signalPins": [
        "OUTA",
        "INA-",
        "INA+",
        "OUTB",
        "INB-",
        "INB+"
      ],
      "interfaces": [
        "ANALOG"
      ]
    },
    "specsJson": {
      "category": "analog-front-end",
      "summary": "범용 RRIO 듀얼 OP-Amp. 3.3V/5V 단일 전원 ADC 프런트엔드에 잘 맞습니다.",
      "supplyVoltage": {
        "min": 2.7,
        "typ": 5,
        "max": 16,
        "recommended": [
          3.3,
          5
        ]
      },
      "ioVoltage": {
        "nominal": [
          2.7,
          3.3,
          5
        ]
      },
      "absoluteMax": {
        "supplyVoltageMax": 16.5
      },
      "interfaces": [
        "ANALOG"
      ],
      "currentConsumption": {
        "idleUa": 750,
        "typicalActiveUa": 1100,
        "maxActiveUa": 2200,
        "defaultMode": "active"
      },
      "analogCharacteristics": {
        "gainBandwidthHz": 3000000,
        "railToRailInput": true,
        "railToRailOutput": true,
        "inputCommonModeIncludesGround": true,
        "note": "LM358 계열보다 저전압에서 headroom 여유가 좋아 센서-ADC 버퍼용으로 유리합니다."
      },
      "validationHints": {
        "decoupling": {
          "minimumCapacitorCount": 1,
          "recommendedValues": [
            "0.1uF"
          ]
        }
      },
      "recommendedCircuit": [
        "고임피던스 센서 버퍼/비반전 증폭용으로 적합",
        "대용량 capacitive load 직접 구동 시 안정도 재검토"
      ],
      "tags": [
        "opamp",
        "analog",
        "rrio",
        "tlv2372"
      ]
    }
  },
  {
    "canonicalMpn": "HC-05",
    "manufacturerName": "Bolutek / clone family",
    "normalizedPartName": "HC-05 Bluetooth Classic UART module",
    "datasheetUrl": "https://wiki.dfrobot.com/Serial_Bluetooth_Module__SKU_TEL0026_",
    "lifecycleStatus": "active",
    "sourceQuality": "module-verified",
    "aliasNames": [
      "HC05",
      "ZS-040"
    ],
    "pinSchemaJson": {
      "package": "Module",
      "powerPins": [
        "VCC"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "TXD",
        "RXD",
        "STATE",
        "KEY",
        "EN"
      ],
      "interfaces": [
        "UART"
      ]
    },
    "specsJson": {
      "category": "rf",
      "summary": "Bluetooth Classic SPP UART 모듈.",
      "supplyVoltage": {
        "min": 3.6,
        "typ": 5,
        "max": 6,
        "recommended": [
          5
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3
        ],
        "tolerance": "RXD는 3.3V 로직 기준으로 보는 편이 안전"
      },
      "interfaces": [
        "UART"
      ],
      "requiresExternalParts": [
        "MCU TX -> HC-05 RX 분압 또는 레벨시프터"
      ],
      "recommendedCircuit": [
        "AT 모드 KEY 핀 처리와 5V 직결 회피"
      ],
      "validationHints": {
        "decoupling": {
          "minimumCapacitorCount": 1,
          "recommendedValues": [
            "10uF",
            "0.1uF"
          ],
          "note": "무선 송신 순간 전류 스파이크 완화를 위해 벌크 캐패시터를 같이 보는 편이 좋습니다."
        },
        "signalLevelLimits": [
          {
            "pinNames": [
              "RXD",
              "RX"
            ],
            "maxVoltage": 3.6,
            "note": "5V MCU TX를 직접 넣기보다 분압 또는 레벨 시프터를 거치는 편이 안전합니다."
          }
        ]
      },
      "tags": [
        "bluetooth",
        "uart",
        "module"
      ],
      "currentConsumption": {
        "idleUa": 8000,
        "measureUa": 30000,
        "peakMa": 40.0,
        "notes": [
          "연결 대기보다 페어링/전송 중 전류가 큼",
          "브레이크아웃 LED가 지속 소모를 만든다"
        ],
        "typicalActiveUa": 30000,
        "maxActiveUa": 30000,
        "typicalPeakMa": 40.0,
        "maxPeakMa": 40.0,
        "moduleOverheadMa": 8.0,
        "modes": [
          {
            "name": "idle-unpaired",
            "currentUa": 8000
          },
          {
            "name": "connected",
            "currentUa": 30000
          },
          {
            "name": "tx-burst",
            "peakMa": 40.0
          }
        ],
        "defaultMode": "connected"
      }
    }
  },
  {
    "canonicalMpn": "HC-06",
    "manufacturerName": "Bolutek / clone family",
    "normalizedPartName": "HC-06 Bluetooth Classic UART module",
    "datasheetUrl": "https://wiki.dfrobot.com/Bluetooth_Module__SKU_DFR0117_",
    "lifecycleStatus": "active",
    "sourceQuality": "module-verified",
    "aliasNames": [
      "HC06"
    ],
    "pinSchemaJson": {
      "package": "Module",
      "powerPins": [
        "VCC"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "TXD",
        "RXD",
        "STATE",
        "EN"
      ],
      "interfaces": [
        "UART"
      ]
    },
    "specsJson": {
      "category": "rf",
      "summary": "슬레이브 전용 Bluetooth UART 모듈 계열.",
      "supplyVoltage": {
        "min": 3.6,
        "typ": 5,
        "max": 6,
        "recommended": [
          5
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3
        ],
        "tolerance": "RXD 5V 직결은 피하는 편이 안전"
      },
      "interfaces": [
        "UART"
      ],
      "requiresExternalParts": [
        "MCU TX -> HC-06 RX 분압 또는 레벨시프터"
      ],
      "recommendedCircuit": [
        "클론별 핀명 차이와 기본 baudrate 차이 확인"
      ],
      "validationHints": {
        "decoupling": {
          "minimumCapacitorCount": 1,
          "recommendedValues": [
            "10uF",
            "0.1uF"
          ],
          "note": "브레이크아웃 LED와 RF burst 때문에 전원 안정화 여유를 두는 편이 안전합니다."
        },
        "signalLevelLimits": [
          {
            "pinNames": [
              "RXD",
              "RX"
            ],
            "maxVoltage": 3.6,
            "note": "5V MCU TX를 직접 넣기보다 분압 또는 레벨 시프터를 거치는 편이 안전합니다."
          }
        ]
      },
      "tags": [
        "bluetooth",
        "uart",
        "module"
      ],
      "currentConsumption": {
        "idleUa": 8000,
        "measureUa": 25000,
        "peakMa": 40.0,
        "notes": [
          "클론별 편차가 크며 UART 활동 시 전류 상승"
        ],
        "typicalActiveUa": 25000,
        "maxActiveUa": 25000,
        "typicalPeakMa": 40.0,
        "maxPeakMa": 40.0,
        "moduleOverheadMa": 8.0,
        "modes": [
          {
            "name": "idle-unpaired",
            "currentUa": 8000
          },
          {
            "name": "connected",
            "currentUa": 25000
          },
          {
            "name": "tx-burst",
            "peakMa": 40.0
          }
        ],
        "defaultMode": "connected"
      }
    }
  },
  {
    "canonicalMpn": "SSD1306",
    "manufacturerName": "Solomon Systech",
    "normalizedPartName": "SSD1306 OLED display controller",
    "datasheetUrl": "https://www.solomon-systech.com/product/ssd1306",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "supportingUrls": [
      "https://cdn-shop.adafruit.com/datasheets/SSD1306.pdf"
    ],
    "pinSchemaJson": {
      "package": "Die/COG controller",
      "signalPins": [
        "SCL",
        "SDA",
        "D0",
        "D1",
        "CS",
        "DC",
        "RES"
      ],
      "interfaces": [
        "I2C",
        "SPI"
      ]
    },
    "specsJson": {
      "category": "display",
      "summary": "소형 OLED 패널에 널리 쓰이는 컨트롤러.",
      "supplyVoltage": {
        "min": 1.65,
        "typ": 3.3,
        "max": 3.5,
        "recommended": [
          3.3
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3
        ]
      },
      "interfaces": [
        "I2C",
        "SPI"
      ],
      "requiresExternalParts": [
        "OLED 패널 및 충전펌프 수동소자"
      ],
      "recommendedCircuit": [
        "실제 모듈은 SSD1306 보드 버전별 핀맵을 별도 관리"
      ],
      "validationHints": {
        "decoupling": {
          "minimumCapacitorCount": 1,
          "recommendedValues": [
            "0.1uF",
            "1uF"
          ],
          "note": "OLED charge pump 전원 변동을 줄이려면 모듈 전원 옆 커패시터 상태를 확인하세요."
        }
      },
      "tags": [
        "oled",
        "display",
        "i2c",
        "spi"
      ],
      "currentConsumption": {
        "sleepUa": 10,
        "idleUa": 25,
        "measureUa": 10000,
        "peakMa": 20.0,
        "notes": [
          "패널 밝기와 점등 픽셀 수에 따라 모듈 전류가 크게 달라짐",
          "controller 단품보다 완성 OLED 모듈 전류가 중요"
        ],
        "typicalActiveUa": 10000,
        "maxActiveUa": 10000,
        "typicalPeakMa": 20.0,
        "maxPeakMa": 20.0,
        "moduleOverheadMa": 2.0,
        "modes": [
          {
            "name": "sleep",
            "currentUa": 10
          },
          {
            "name": "display-dim",
            "currentUa": 2500,
            "note": "few pixels lit / low brightness"
          },
          {
            "name": "display-full-on",
            "currentUa": 10000,
            "peakMa": 20.0,
            "note": "bright full-screen draw"
          }
        ],
        "defaultMode": "display-dim"
      }
    }
  },
  {
    "canonicalMpn": "MCP3008-I/P",
    "manufacturerName": "Microchip Technology",
    "normalizedPartName": "MCP3008 8-channel 10-bit ADC",
    "datasheetUrl": "https://www.microchip.com/en-us/product/mcp3008",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "pinSchemaJson": {
      "package": "DIP-16",
      "pinCount": 16,
      "powerPins": [
        "VDD",
        "VREF"
      ],
      "groundPins": [
        "AGND",
        "DGND"
      ],
      "signalPins": [
        "CLK",
        "DOUT",
        "DIN",
        "CS/SHDN",
        "CH0",
        "CH1",
        "CH2",
        "CH3",
        "CH4",
        "CH5",
        "CH6",
        "CH7"
      ],
      "interfaces": [
        "SPI"
      ]
    },
    "specsJson": {
      "category": "analog-front-end",
      "summary": "8채널 아날로그 입력을 SPI로 읽는 10비트 ADC.",
      "supplyVoltage": {
        "min": 2.7,
        "typ": 3.3,
        "max": 5.5,
        "recommended": [
          3.3,
          5
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3,
          5
        ]
      },
      "interfaces": [
        "SPI"
      ],
      "requiresExternalParts": [
        "VREF 안정화",
        "아날로그 입력 소스 임피던스 검토"
      ],
      "recommendedCircuit": [
        "VREF와 MCU 로직 전압 관계를 설계 문서에 고정"
      ],
      "tags": [
        "adc",
        "spi",
        "analog-front-end"
      ],
      "currentConsumption": {
        "sleepUa": 0.005,
        "idleUa": 2,
        "measureUa": 320,
        "peakMa": 0.5,
        "notes": [
          "샘플링 속도와 VDD에 따라 active current 변화"
        ],
        "typicalActiveUa": 320,
        "maxActiveUa": 320,
        "typicalPeakMa": 0.5,
        "maxPeakMa": 0.5,
        "moduleOverheadMa": 0.3,
        "modes": [
          {
            "name": "sleep",
            "currentUa": 0.005
          },
          {
            "name": "idle",
            "currentUa": 2
          },
          {
            "name": "active",
            "currentUa": 320
          },
          {
            "name": "peak-burst",
            "peakMa": 0.5
          }
        ],
        "defaultMode": "active"
      }
    }
  },
  {
    "canonicalMpn": "LM1117",
    "manufacturerName": "Texas Instruments",
    "normalizedPartName": "LM1117 low-dropout linear regulator family",
    "datasheetUrl": "https://www.ti.com/lit/ds/symlink/lm1117.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "LM1117-3.3",
      "LM1117-5.0",
      "LM1117-ADJ"
    ],
    "pinSchemaJson": {
      "package": "SOT-223",
      "pinCount": 3,
      "powerPins": [
        "VIN",
        "VOUT"
      ],
      "groundPins": [
        "GND"
      ]
    },
    "specsJson": {
      "category": "power",
      "summary": "AMS1117과 유사하게 자주 쓰이는 TI 계열 LDO 패밀리.",
      "supplyVoltage": {
        "max": 20
      },
      "absoluteMax": {
        "supplyVoltageMax": 20
      },
      "requiresExternalParts": [
        "입출력 커패시터"
      ],
      "recommendedCircuit": [
        "dropout과 발열 동시 검토",
        "입력/출력 바이패스 근접 배치"
      ],
      "tags": [
        "regulator",
        "ldo",
        "lm1117"
      ]
    }
  },
  {
    "canonicalMpn": "MCP1700T-3302E/TT",
    "manufacturerName": "Microchip Technology",
    "normalizedPartName": "MCP1700 3.3V low quiescent LDO regulator",
    "datasheetUrl": "https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP1700-Data-Sheet-20001826F.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "MCP1700",
      "MCP1700-3302"
    ],
    "pinSchemaJson": {
      "package": "SOT-23",
      "pinCount": 3,
      "powerPins": [
        "VIN",
        "VOUT"
      ],
      "groundPins": [
        "GND"
      ]
    },
    "specsJson": {
      "category": "power",
      "summary": "배터리 구동 제품에 자주 쓰이는 초저 대기전류 LDO.",
      "supplyVoltage": {
        "min": 2.3,
        "typ": 3.3,
        "max": 6.0,
        "recommended": [
          3.3
        ]
      },
      "absoluteMax": {
        "supplyVoltageMax": 6.5
      },
      "currentConsumption": {
        "idleUa": 1.6,
        "typicalActiveUa": 1.6,
        "maxActiveUa": 4,
        "defaultMode": "idle",
        "modes": [
          {
            "name": "idle",
            "currentUa": 1.6
          }
        ],
        "notes": [
          "레귤레이터 자체 IQ 기준",
          "부하전류는 별도 합산 필요"
        ]
      },
      "requiresExternalParts": [
        "입출력 커패시터"
      ],
      "recommendedCircuit": [
        "배터리 저전압 조건에서 dropout 검토"
      ],
      "tags": [
        "regulator",
        "ldo",
        "low-iq",
        "battery"
      ]
    }
  },
  {
    "canonicalMpn": "AP2112K-3.3TRG1",
    "manufacturerName": "Diodes Incorporated",
    "normalizedPartName": "AP2112K 3.3V low-noise LDO regulator",
    "datasheetUrl": "https://www.diodes.com/assets/Datasheets/AP2112.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "AP2112K-3.3",
      "AP2112"
    ],
    "pinSchemaJson": {
      "package": "SOT-23-5",
      "pinCount": 5,
      "powerPins": [
        "VIN",
        "VOUT"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "EN"
      ]
    },
    "specsJson": {
      "category": "power",
      "summary": "3.3V 센서/무선 모듈 전원에 자주 보이는 저노이즈 LDO.",
      "supplyVoltage": {
        "min": 2.5,
        "typ": 3.3,
        "max": 6.0,
        "recommended": [
          3.3
        ]
      },
      "absoluteMax": {
        "supplyVoltageMax": 6.5
      },
      "currentConsumption": {
        "idleUa": 55,
        "typicalActiveUa": 55,
        "maxActiveUa": 80,
        "defaultMode": "enabled",
        "modes": [
          {
            "name": "enabled",
            "currentUa": 55
          },
          {
            "name": "shutdown",
            "currentUa": 0.01
          }
        ],
        "notes": [
          "레귤레이터 자체 ground current 기준"
        ]
      },
      "requiresExternalParts": [
        "입출력 커패시터"
      ],
      "recommendedCircuit": [
        "EN 핀 부동 방지",
        "RF 모듈 근처 벌크 커패시터 검토"
      ],
      "tags": [
        "regulator",
        "ldo",
        "ap2112"
      ]
    }
  },
  {
    "canonicalMpn": "XC6206P332MR",
    "manufacturerName": "Torex Semiconductor",
    "normalizedPartName": "XC6206 3.3V low quiescent LDO regulator",
    "datasheetUrl": "https://www.torexsemi.com/file/xc6206/XC6206.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "XC6206",
      "XC6206P332"
    ],
    "pinSchemaJson": {
      "package": "SOT-23",
      "pinCount": 3,
      "powerPins": [
        "VIN",
        "VOUT"
      ],
      "groundPins": [
        "GND"
      ]
    },
    "specsJson": {
      "category": "power",
      "summary": "소형 센서/MCU 보드에 흔한 3.3V LDO.",
      "supplyVoltage": {
        "min": 2.0,
        "typ": 3.3,
        "max": 6.0,
        "recommended": [
          3.3
        ]
      },
      "absoluteMax": {
        "supplyVoltageMax": 7.0
      },
      "currentConsumption": {
        "idleUa": 1,
        "typicalActiveUa": 1,
        "maxActiveUa": 8,
        "defaultMode": "idle",
        "modes": [
          {
            "name": "idle",
            "currentUa": 1
          }
        ],
        "notes": [
          "레귤레이터 자체 IQ 기준"
        ]
      },
      "requiresExternalParts": [
        "입출력 커패시터"
      ],
      "recommendedCircuit": [
        "출력 캐패시터 ESR 조건 확인"
      ],
      "tags": [
        "regulator",
        "ldo",
        "xc6206"
      ]
    }
  },
  {
    "canonicalMpn": "LM2596S-5.0",
    "manufacturerName": "Texas Instruments",
    "normalizedPartName": "LM2596 5V buck regulator",
    "datasheetUrl": "https://www.ti.com/lit/ds/symlink/lm2596.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "LM2596",
      "LM2596S",
      "LM2596S-ADJ"
    ],
    "pinSchemaJson": {
      "package": "TO-263-5",
      "pinCount": 5,
      "powerPins": [
        "VIN",
        "OUT",
        "FB"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "ON/OFF",
        "SW",
        "FB"
      ]
    },
    "specsJson": {
      "category": "power",
      "summary": "가장 흔한 메이커용 buck 모듈 기반 스위칭 레귤레이터.",
      "supplyVoltage": {
        "min": 4.5,
        "typ": 12,
        "max": 40,
        "recommended": [
          5,
          12,
          24
        ]
      },
      "absoluteMax": {
        "supplyVoltageMax": 45
      },
      "requiresExternalParts": [
        "인덕터",
        "쇼트키 다이오드",
        "입출력 전해/세라믹 커패시터"
      ],
      "recommendedCircuit": [
        "인덕터 전류 정격 검토",
        "쇼트키 다이오드 스트레스 검토",
        "FB 경로와 리플 저감 검토"
      ],
      "tags": [
        "buck",
        "switching-regulator",
        "lm2596"
      ]
    }
  },
  {
    "canonicalMpn": "MP1584EN",
    "manufacturerName": "Monolithic Power Systems",
    "normalizedPartName": "MP1584 high-frequency step-down converter",
    "datasheetUrl": "https://www.monolithicpower.com/en/mp1584.html",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "MP1584",
      "MP1584 module"
    ],
    "pinSchemaJson": {
      "package": "SOIC-8EP",
      "pinCount": 8,
      "powerPins": [
        "IN",
        "BST",
        "FB"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "EN",
        "SW",
        "COMP",
        "FB"
      ]
    },
    "specsJson": {
      "category": "power",
      "summary": "소형 고주파 buck 모듈에 널리 쓰이는 step-down 컨버터.",
      "supplyVoltage": {
        "min": 4.5,
        "typ": 12,
        "max": 28,
        "recommended": [
          5,
          12,
          24
        ]
      },
      "absoluteMax": {
        "supplyVoltageMax": 30
      },
      "requiresExternalParts": [
        "인덕터",
        "쇼트키 또는 동기정류 경로 확인",
        "입출력 커패시터"
      ],
      "recommendedCircuit": [
        "COMP 보상값과 출력 커패시터 조합 확인",
        "고주파 리플과 열분산 확인"
      ],
      "tags": [
        "buck",
        "switching-regulator",
        "mp1584"
      ]
    }
  },
  {
    "canonicalMpn": "MT3608",
    "manufacturerName": "Aerosemi / clone family",
    "normalizedPartName": "MT3608 boost converter module family",
    "datasheetUrl": "https://wiki.dfrobot.com/2A_Boost_Converter_Module_SKU_DFR0203",
    "lifecycleStatus": "active",
    "sourceQuality": "module-verified",
    "aliasNames": [
      "MT3608 module"
    ],
    "pinSchemaJson": {
      "package": "Module",
      "powerPins": [
        "VIN",
        "VOUT"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "EN",
        "FB",
        "SW"
      ]
    },
    "specsJson": {
      "category": "power",
      "summary": "배터리 승압용으로 자주 쓰이는 소형 boost 모듈 계열.",
      "supplyVoltage": {
        "min": 2.0,
        "typ": 3.7,
        "max": 24,
        "recommended": [
          3.7,
          5
        ]
      },
      "absoluteMax": {
        "supplyVoltageMax": 28
      },
      "requiresExternalParts": [
        "인덕터",
        "입출력 커패시터"
      ],
      "recommendedCircuit": [
        "기동 inrush와 배터리 전압강하 확인",
        "부하 peak에서 brown-out review"
      ],
      "tags": [
        "boost",
        "switching-regulator",
        "module"
      ]
    }
  },
  {
    "canonicalMpn": "ESP32-S3-WROOM-1",
    "manufacturerName": "Espressif Systems",
    "normalizedPartName": "ESP32-S3 Wi-Fi Bluetooth LE module",
    "datasheetUrl": "https://www.espressif.com/sites/default/files/documentation/esp32-s3-wroom-1_esp32-s3-wroom-1u_datasheet_en.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "ESP32-S3-WROOM-1U"
    ],
    "pinSchemaJson": {
      "package": "Module",
      "powerPins": [
        "3V3"
      ],
      "groundPins": [
        "GND"
      ],
      "bootPins": [
        "GPIO0",
        "EN"
      ],
      "interfaces": [
        "GPIO",
        "ADC",
        "PWM",
        "I2C",
        "SPI",
        "UART"
      ]
    },
    "specsJson": {
      "category": "mcu",
      "summary": "3.3V 전용의 차세대 Espressif Wi-Fi/BLE 모듈.",
      "supplyVoltage": {
        "min": 3.0,
        "typ": 3.3,
        "max": 3.6,
        "recommended": [
          3.3
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3
        ],
        "tolerance": "5V tolerant 아님"
      },
      "absoluteMax": {
        "supplyVoltageMax": 3.6,
        "ioVoltageMax": 3.6
      },
      "interfaces": [
        "GPIO",
        "ADC",
        "PWM",
        "I2C",
        "SPI",
        "UART"
      ],
      "currentConsumption": {
        "sleepUa": 7,
        "idleUa": 20000,
        "typicalActiveUa": 80000,
        "typicalPeakMa": 350,
        "maxPeakMa": 500,
        "defaultMode": "wifi-active",
        "modes": [
          {
            "name": "sleep",
            "currentUa": 7
          },
          {
            "name": "idle",
            "currentUa": 20000
          },
          {
            "name": "wifi-active",
            "currentUa": 80000
          },
          {
            "name": "tx-burst",
            "peakMa": 350
          }
        ],
        "notes": [
          "무선 burst 전류가 커서 벌크 캐패시터와 레귤레이터 여유를 같이 보는 편이 안전"
        ]
      },
      "requiresExternalParts": [
        "EN/GPIO0 부트 바이어스",
        "0.1uF/10uF 전원 디커플링"
      ],
      "recommendedCircuit": [
        "무선 peak 전류에 대한 3.3V 레일 여유 확인"
      ],
      "tags": [
        "esp32-s3",
        "wifi",
        "ble",
        "mcu"
      ]
    }
  },
  {
    "canonicalMpn": "ESP8266EX",
    "manufacturerName": "Espressif Systems",
    "normalizedPartName": "ESP8266EX Wi-Fi SoC",
    "datasheetUrl": "https://www.espressif.com/sites/default/files/documentation/0a-esp8266ex_datasheet_en.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "pinSchemaJson": {
      "package": "QFN-32",
      "powerPins": [
        "VDD3P3",
        "VDD_RTC"
      ],
      "groundPins": [
        "GND"
      ],
      "bootPins": [
        "GPIO0",
        "GPIO2",
        "GPIO15",
        "CH_PD",
        "EN"
      ],
      "interfaces": [
        "GPIO",
        "ADC",
        "PWM",
        "I2C",
        "SPI",
        "UART"
      ]
    },
    "specsJson": {
      "category": "mcu",
      "summary": "ESP-01 계열 모듈의 기반이 되는 3.3V Wi-Fi SoC.",
      "supplyVoltage": {
        "min": 3.0,
        "typ": 3.3,
        "max": 3.6,
        "recommended": [
          3.3
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3
        ],
        "tolerance": "5V tolerant 아님"
      },
      "absoluteMax": {
        "supplyVoltageMax": 3.6,
        "ioVoltageMax": 3.6
      },
      "interfaces": [
        "GPIO",
        "ADC",
        "PWM",
        "I2C",
        "SPI",
        "UART"
      ],
      "currentConsumption": {
        "sleepUa": 20,
        "idleUa": 15000,
        "typicalActiveUa": 70000,
        "typicalPeakMa": 250,
        "maxPeakMa": 400,
        "defaultMode": "wifi-active",
        "modes": [
          {
            "name": "sleep",
            "currentUa": 20
          },
          {
            "name": "idle",
            "currentUa": 15000
          },
          {
            "name": "wifi-active",
            "currentUa": 70000
          },
          {
            "name": "tx-burst",
            "peakMa": 250
          }
        ]
      },
      "requiresExternalParts": [
        "CH_PD/EN 풀업",
        "GPIO0/GPIO2/GPIO15 부트 바이어스",
        "전원 디커플링"
      ],
      "recommendedCircuit": [
        "기동/송신 peak에 대한 brown-out review"
      ],
      "tags": [
        "esp8266",
        "wifi",
        "soc"
      ]
    }
  },
  {
    "canonicalMpn": "ESP-01",
    "manufacturerName": "Ai-Thinker / Espressif module family",
    "normalizedPartName": "ESP-01 ESP8266 Wi-Fi module",
    "datasheetUrl": "https://wiki.dfrobot.com/ESP8266_WiFi_Module_SKU__TEL0044",
    "lifecycleStatus": "active",
    "sourceQuality": "module-verified",
    "supportingUrls": [
      "https://docs.ai-thinker.com/en/esp8266/modules/esp-01"
    ],
    "pinSchemaJson": {
      "package": "Module",
      "powerPins": [
        "VCC"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "TX",
        "RX",
        "GPIO0",
        "GPIO2",
        "RST",
        "CH_PD"
      ],
      "bootPins": [
        "GPIO0",
        "GPIO2",
        "CH_PD",
        "RST"
      ],
      "interfaces": [
        "UART",
        "GPIO"
      ]
    },
    "specsJson": {
      "category": "module",
      "summary": "ESP8266 기반 최소형 Wi-Fi 모듈.",
      "supplyVoltage": {
        "min": 3.0,
        "typ": 3.3,
        "max": 3.6,
        "recommended": [
          3.3
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3
        ],
        "tolerance": "5V tolerant 아님"
      },
      "absoluteMax": {
        "supplyVoltageMax": 3.6,
        "ioVoltageMax": 3.6
      },
      "interfaces": [
        "UART",
        "GPIO"
      ],
      "currentConsumption": {
        "sleepUa": 20,
        "idleUa": 15000,
        "typicalActiveUa": 70000,
        "typicalPeakMa": 250,
        "maxPeakMa": 400,
        "defaultMode": "wifi-active",
        "modes": [
          {
            "name": "sleep",
            "currentUa": 20
          },
          {
            "name": "wifi-active",
            "currentUa": 70000
          },
          {
            "name": "tx-burst",
            "peakMa": 250
          }
        ]
      },
      "requiresExternalParts": [
        "3.3V 전원",
        "CH_PD 풀업",
        "GPIO0 부트 스트랩 처리",
        "벌크 디커플링"
      ],
      "recommendedCircuit": [
        "UART RX 3.3V 입력 한계 준수",
        "기동 전류 스파이크 대비"
      ],
      "tags": [
        "esp-01",
        "wifi",
        "module"
      ]
    }
  },
  {
    "canonicalMpn": "HM-10",
    "manufacturerName": "JNHuaMao / clone family",
    "normalizedPartName": "HM-10 BLE UART module",
    "datasheetUrl": "https://wiki.dfrobot.com/Bluetooth_4.0_BLE_Module__SKU_TEL0105_",
    "lifecycleStatus": "active",
    "sourceQuality": "module-verified",
    "aliasNames": [
      "HM10",
      "CC2541 module"
    ],
    "pinSchemaJson": {
      "package": "Module",
      "powerPins": [
        "VCC"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "TXD",
        "RXD",
        "STATE",
        "BRK",
        "EN"
      ],
      "interfaces": [
        "UART"
      ]
    },
    "specsJson": {
      "category": "rf",
      "summary": "저전력 BLE UART 브리지 모듈 계열.",
      "supplyVoltage": {
        "min": 3.3,
        "typ": 3.3,
        "max": 6.0,
        "recommended": [
          3.3,
          5
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3
        ],
        "tolerance": "RXD는 3.3V 로직 기준으로 보는 편이 안전"
      },
      "interfaces": [
        "UART"
      ],
      "currentConsumption": {
        "sleepUa": 400,
        "idleUa": 9000,
        "typicalActiveUa": 18000,
        "typicalPeakMa": 40,
        "maxPeakMa": 60,
        "defaultMode": "connected",
        "modes": [
          {
            "name": "sleep",
            "currentUa": 400
          },
          {
            "name": "advertising",
            "currentUa": 9000
          },
          {
            "name": "connected",
            "currentUa": 18000
          },
          {
            "name": "tx-burst",
            "peakMa": 40
          }
        ]
      },
      "requiresExternalParts": [
        "MCU TX -> HM-10 RX 3.3V 로직 호환 확인",
        "디커플링 커패시터"
      ],
      "recommendedCircuit": [
        "클론별 firmware 차이와 EN/STATE 핀 동작 확인"
      ],
      "tags": [
        "ble",
        "uart",
        "module"
      ]
    }
  },
  {
    "canonicalMpn": "NRF24L01+",
    "manufacturerName": "Nordic Semiconductor",
    "normalizedPartName": "nRF24L01+ 2.4GHz transceiver",
    "datasheetUrl": "https://docs.nordicsemi.com/bundle/nRF24L01P_PS_v1.0/resource/nRF24L01P_PS_v1.0.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "nRF24L01",
      "NRF24L01+PA+LNA"
    ],
    "pinSchemaJson": {
      "package": "QFN-20 / Module",
      "powerPins": [
        "VCC"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "CE",
        "CSN",
        "SCK",
        "MOSI",
        "MISO",
        "IRQ"
      ],
      "interfaces": [
        "SPI"
      ]
    },
    "specsJson": {
      "category": "rf",
      "summary": "2.4GHz 저전력 무선 송수신기. burst 전류와 전원 노이즈에 민감.",
      "supplyVoltage": {
        "min": 1.9,
        "typ": 3.3,
        "max": 3.6,
        "recommended": [
          3.3
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3
        ],
        "tolerance": "5V tolerant 아님"
      },
      "absoluteMax": {
        "supplyVoltageMax": 3.6,
        "ioVoltageMax": 3.6
      },
      "interfaces": [
        "SPI"
      ],
      "currentConsumption": {
        "sleepUa": 0.9,
        "idleUa": 26000,
        "typicalActiveUa": 11500,
        "typicalPeakMa": 14,
        "maxPeakMa": 15,
        "moduleOverheadMa": 1,
        "defaultMode": "rx",
        "modes": [
          {
            "name": "sleep",
            "currentUa": 0.9
          },
          {
            "name": "rx",
            "currentUa": 13000
          },
          {
            "name": "tx",
            "currentUa": 11500
          },
          {
            "name": "tx-burst",
            "peakMa": 14
          }
        ]
      },
      "requiresExternalParts": [
        "0.1uF + 수 uF 벌크 커패시터",
        "3.3V 안정 전원"
      ],
      "recommendedCircuit": [
        "PA/LNA 보드라면 peak 전류를 더 보수적으로 계산"
      ],
      "tags": [
        "rf",
        "2.4ghz",
        "spi"
      ]
    }
  },
  {
    "canonicalMpn": "PN5321A3HN/C1",
    "manufacturerName": "NXP Semiconductors",
    "normalizedPartName": "PN532 NFC controller",
    "datasheetUrl": "https://www.nxp.com/docs/en/nxp/data-sheets/PN532_C1.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "PN532",
      "PN532 module"
    ],
    "pinSchemaJson": {
      "package": "HVQFN-40 / Module",
      "powerPins": [
        "VDD"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "SDA",
        "SCL",
        "MOSI",
        "MISO",
        "SCK",
        "RX",
        "TX",
        "SS",
        "IRQ",
        "RSTPDN"
      ],
      "interfaces": [
        "I2C",
        "SPI",
        "UART"
      ]
    },
    "specsJson": {
      "category": "rf",
      "summary": "NFC reader/controller. I2C/SPI/UART 선택 가능.",
      "supplyVoltage": {
        "min": 2.7,
        "typ": 3.3,
        "max": 5.5,
        "recommended": [
          3.3,
          5
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3
        ],
        "tolerance": "브레이크아웃별 레벨시프터 포함 여부 확인"
      },
      "interfaces": [
        "I2C",
        "SPI",
        "UART"
      ],
      "currentConsumption": {
        "sleepUa": 80,
        "idleUa": 50000,
        "typicalActiveUa": 80000,
        "typicalPeakMa": 120,
        "maxPeakMa": 150,
        "moduleOverheadMa": 2,
        "defaultMode": "active",
        "modes": [
          {
            "name": "sleep",
            "currentUa": 80
          },
          {
            "name": "idle",
            "currentUa": 50000
          },
          {
            "name": "active",
            "currentUa": 80000
          },
          {
            "name": "rf-burst",
            "peakMa": 120
          }
        ]
      },
      "requiresExternalParts": [
        "전원 디커플링",
        "인터페이스 모드 선택 배선 확인"
      ],
      "recommendedCircuit": [
        "안테나/모듈 버전별 전원 전류 차이 확인"
      ],
      "tags": [
        "nfc",
        "rfid",
        "i2c",
        "spi",
        "uart"
      ]
    }
  },
  {
    "canonicalMpn": "MFRC522",
    "manufacturerName": "NXP Semiconductors",
    "normalizedPartName": "MFRC522 contactless reader IC / module family",
    "datasheetUrl": "https://www.nxp.com/docs/en/data-sheet/MFRC522.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "RC522",
      "MFRC522 module"
    ],
    "pinSchemaJson": {
      "package": "QFN-32 / Module",
      "powerPins": [
        "VDD"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "SDA",
        "SCK",
        "MOSI",
        "MISO",
        "RST"
      ],
      "interfaces": [
        "SPI",
        "I2C",
        "UART"
      ]
    },
    "specsJson": {
      "category": "rf",
      "summary": "메이커 보드에서 흔한 RFID/NFC reader 계열.",
      "supplyVoltage": {
        "min": 2.5,
        "typ": 3.3,
        "max": 3.6,
        "recommended": [
          3.3
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3
        ],
        "tolerance": "5V tolerant 아님"
      },
      "absoluteMax": {
        "supplyVoltageMax": 3.9,
        "ioVoltageMax": 3.9
      },
      "interfaces": [
        "SPI",
        "I2C",
        "UART"
      ],
      "currentConsumption": {
        "sleepUa": 10000,
        "idleUa": 13000,
        "typicalActiveUa": 26000,
        "typicalPeakMa": 40,
        "maxPeakMa": 60,
        "moduleOverheadMa": 1,
        "defaultMode": "active",
        "modes": [
          {
            "name": "idle",
            "currentUa": 13000
          },
          {
            "name": "active",
            "currentUa": 26000
          },
          {
            "name": "rf-burst",
            "peakMa": 40
          }
        ]
      },
      "requiresExternalParts": [
        "0.1uF 디커플링",
        "3.3V logic-level 준수"
      ],
      "recommendedCircuit": [
        "UNO/5V MCU에서는 SCK/MOSI/SDA/RST에 레벨 시프팅 또는 허용전압 검토"
      ],
      "tags": [
        "rfid",
        "nfc",
        "spi",
        "module"
      ]
    }
  },
  {
    "canonicalMpn": "ADS1115",
    "manufacturerName": "Texas Instruments",
    "normalizedPartName": "ADS1115 16-bit I2C ADC",
    "datasheetUrl": "https://www.ti.com/lit/gpn/ads1115",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "ADS1115IDGSR",
      "ADS1115 breakout"
    ],
    "pinSchemaJson": {
      "package": "VSSOP-10 / Module",
      "pinCount": 10,
      "powerPins": [
        "VDD"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "AIN0",
        "AIN1",
        "AIN2",
        "AIN3",
        "ADDR",
        "ALERT/RDY",
        "SDA",
        "SCL"
      ],
      "interfaces": [
        "I2C",
        "ADC"
      ]
    },
    "specsJson": {
      "category": "interface",
      "summary": "16-bit delta-sigma ADC. 저속 정밀 계측과 고임피던스 센서 입력에 자주 사용됩니다.",
      "supplyVoltage": {
        "min": 2.0,
        "typ": 3.3,
        "max": 5.5,
        "recommended": [
          3.3,
          5
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3,
          5
        ]
      },
      "interfaces": [
        "I2C",
        "ADC"
      ],
      "currentConsumption": {
        "sleepUa": 500,
        "idleUa": 150,
        "typicalActiveUa": 150,
        "maxActiveUa": 200,
        "typicalPeakMa": 0.2,
        "maxPeakMa": 0.3,
        "defaultMode": "continuous"
      },
      "adcProfile": {
        "acquisitionTimeUs": 8,
        "sampleCapacitancePf": 5,
        "effectiveBits": 16,
        "referenceVoltage": 4.096,
        "note": "Delta-sigma 구조라 SAR ADC보다 소스 임피던스 민감도가 낮지만, PGA 범위와 변환 속도는 별도 확인이 필요합니다."
      },
      "validationHints": {
        "decoupling": {
          "minimumCapacitorCount": 1,
          "recommendedValues": [
            "0.1uF"
          ],
          "note": "VDD 근처 디커플링을 권장합니다."
        },
        "strapPins": [
          {
            "pin": "ADDR",
            "required": false,
            "note": "복수 장치 구성 시 ADDR 스트랩을 명시해 I2C 주소 충돌을 피하세요."
          }
        ]
      },
      "recommendedCircuit": [
        "ADDR 스트랩 명시",
        "입력 full-scale과 PGA 설정 일치 확인"
      ],
      "tags": [
        "adc",
        "i2c",
        "precision",
        "ads1115"
      ]
    }
  },
  {
    "canonicalMpn": "ADS1015",
    "manufacturerName": "Texas Instruments",
    "normalizedPartName": "ADS1015 12-bit I2C ADC",
    "datasheetUrl": "https://www.ti.com/lit/gpn/ads1015",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "ADS1015IDGS",
      "ADS1015 breakout"
    ],
    "pinSchemaJson": {
      "package": "VSSOP-10 / Module",
      "pinCount": 10,
      "powerPins": [
        "VDD"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "AIN0",
        "AIN1",
        "AIN2",
        "AIN3",
        "ADDR",
        "ALERT/RDY",
        "SDA",
        "SCL"
      ],
      "interfaces": [
        "I2C",
        "ADC"
      ]
    },
    "specsJson": {
      "category": "interface",
      "summary": "12-bit delta-sigma ADC. ADS1115보다 빠른 응답이 필요한 저속 아날로그 측정에 적합합니다.",
      "supplyVoltage": {
        "min": 2.0,
        "typ": 3.3,
        "max": 5.5,
        "recommended": [
          3.3,
          5
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3,
          5
        ]
      },
      "interfaces": [
        "I2C",
        "ADC"
      ],
      "currentConsumption": {
        "sleepUa": 500,
        "idleUa": 150,
        "typicalActiveUa": 150,
        "maxActiveUa": 200,
        "typicalPeakMa": 0.2,
        "maxPeakMa": 0.3,
        "defaultMode": "continuous"
      },
      "adcProfile": {
        "acquisitionTimeUs": 4,
        "sampleCapacitancePf": 5,
        "effectiveBits": 12,
        "referenceVoltage": 4.096,
        "note": "ADS1115 계열보다 빠른 샘플링에 유리하지만 분해능은 낮습니다."
      },
      "validationHints": {
        "decoupling": {
          "minimumCapacitorCount": 1,
          "recommendedValues": [
            "0.1uF"
          ]
        },
        "strapPins": [
          {
            "pin": "ADDR",
            "required": false,
            "note": "I2C 다중 장치 설계에서는 ADDR 스트랩을 명확히 두는 것이 좋습니다."
          }
        ]
      },
      "recommendedCircuit": [
        "ADDR 스트랩 명시",
        "채널 입력 RC 필터와 데이터레이트 조합 검토"
      ],
      "tags": [
        "adc",
        "i2c",
        "precision",
        "ads1015"
      ]
    }
  },
  {
    "canonicalMpn": "MCP3208",
    "manufacturerName": "Microchip Technology",
    "normalizedPartName": "MCP3208 12-bit SPI ADC",
    "datasheetUrl": "https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/21298e.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "MCP3208-CI/P",
      "MCP3208 breakout"
    ],
    "pinSchemaJson": {
      "package": "DIP-16 / SOIC-16 / Module",
      "pinCount": 16,
      "powerPins": [
        "VDD",
        "VREF"
      ],
      "groundPins": [
        "VSS",
        "AGND",
        "DGND"
      ],
      "signalPins": [
        "CH0",
        "CH1",
        "CH2",
        "CH3",
        "CH4",
        "CH5",
        "CH6",
        "CH7",
        "CLK",
        "DOUT",
        "DIN",
        "CS/SHDN"
      ],
      "interfaces": [
        "SPI",
        "ADC"
      ]
    },
    "specsJson": {
      "category": "analog-front-end",
      "summary": "12-bit SPI SAR ADC. 외부 VREF 품질과 입력 소스 임피던스가 정확도에 큰 영향을 줍니다.",
      "supplyVoltage": {
        "min": 2.7,
        "typ": 5,
        "max": 5.5,
        "recommended": [
          3.3,
          5
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3,
          5
        ]
      },
      "interfaces": [
        "SPI",
        "ADC"
      ],
      "currentConsumption": {
        "idleUa": 5,
        "typicalActiveUa": 400,
        "maxActiveUa": 550,
        "typicalPeakMa": 0.55,
        "maxPeakMa": 0.9,
        "defaultMode": "sample"
      },
      "adcProfile": {
        "acquisitionTimeUs": 1.5,
        "sampleCapacitancePf": 20,
        "effectiveBits": 12,
        "referenceVoltage": 5,
        "note": "SAR ADC라 채널 전환 시 입력 소스 임피던스와 VREF 리플 영향을 적극적으로 봐야 합니다."
      },
      "validationHints": {
        "decoupling": {
          "minimumCapacitorCount": 2,
          "recommendedValues": [
            "0.1uF",
            "1uF"
          ],
          "note": "VDD와 VREF 모두 로컬 바이패스가 중요합니다."
        }
      },
      "recommendedCircuit": [
        "VREF 로컬 바이패스",
        "CHx 고임피던스 입력이면 버퍼 또는 RC 재검토",
        "AGND/DGND 리턴 경로 확인"
      ],
      "tags": [
        "adc",
        "spi",
        "sar",
        "mcp3208"
      ]
    }
  },
  {
    "canonicalMpn": "HX711",
    "manufacturerName": "Avia Semiconductor",
    "normalizedPartName": "HX711 load cell ADC",
    "datasheetUrl": "https://cdn.sparkfun.com/datasheets/Sensors/ForceFlex/hx711_english.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "module-verified",
    "aliasNames": [
      "HX711ADC",
      "Load Cell Amplifier"
    ],
    "pinSchemaJson": {
      "package": "SOP-16 / Module",
      "pinCount": 16,
      "powerPins": [
        "VSUP",
        "AVDD",
        "DVDD"
      ],
      "groundPins": [
        "AGND",
        "DGND"
      ],
      "signalPins": [
        "INA+",
        "INA-",
        "INB+",
        "INB-",
        "DOUT",
        "PD_SCK",
        "RATE"
      ],
      "interfaces": [
        "GPIO",
        "ADC"
      ]
    },
    "specsJson": {
      "category": "analog-front-end",
      "summary": "로드셀 브리지 센서용 24-bit ADC/PGA. 브리지 배선 균형과 레퍼런스 경로가 핵심입니다.",
      "supplyVoltage": {
        "min": 2.6,
        "typ": 5,
        "max": 5.5,
        "recommended": [
          5,
          3.3
        ]
      },
      "ioVoltage": {
        "nominal": [
          2.6,
          3.3,
          5
        ]
      },
      "interfaces": [
        "GPIO",
        "ADC"
      ],
      "currentConsumption": {
        "sleepUa": 1,
        "idleUa": 1500,
        "typicalActiveUa": 1500,
        "maxActiveUa": 3000,
        "typicalPeakMa": 3,
        "maxPeakMa": 5,
        "defaultMode": "active"
      },
      "analogCharacteristics": {
        "needsBufferForAdc": false,
        "note": "자체 증폭기와 ADC를 포함하므로 MCU ADC 앞 버퍼 대상과 다르게 취급합니다."
      },
      "validationHints": {
        "decoupling": {
          "minimumCapacitorCount": 2,
          "recommendedValues": [
            "0.1uF",
            "10uF"
          ]
        }
      },
      "recommendedCircuit": [
        "E+/E-/A+/A- 배선 균형 확인",
        "AVDD/레퍼런스 디커플링",
        "디지털 클럭 노이즈 분리"
      ],
      "tags": [
        "adc",
        "loadcell",
        "bridge",
        "hx711"
      ]
    }
  },
  {
    "canonicalMpn": "LM358",
    "manufacturerName": "Texas Instruments",
    "normalizedPartName": "LM358 dual operational amplifier",
    "datasheetUrl": "https://www.ti.com/lit/gpn/lm358",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "LM358N",
      "LM358P",
      "LM358D"
    ],
    "pinSchemaJson": {
      "package": "DIP-8 / SOIC-8",
      "pinCount": 8,
      "powerPins": [
        "V+",
        "VCC"
      ],
      "groundPins": [
        "V-",
        "GND"
      ],
      "signalPins": [
        "OUT1",
        "IN1-",
        "IN1+",
        "OUT2",
        "IN2-",
        "IN2+"
      ],
      "interfaces": [
        "ANALOG"
      ]
    },
    "specsJson": {
      "category": "analog-front-end",
      "summary": "대표적인 단일전원 듀얼 OP-Amp. rail-to-rail output이 아니므로 출력 스윙 headroom 검토가 중요합니다.",
      "supplyVoltage": {
        "min": 3.0,
        "typ": 5,
        "max": 32,
        "recommended": [
          5,
          12
        ]
      },
      "ioVoltage": {
        "nominal": [
          3.3,
          5
        ]
      },
      "interfaces": [
        "ANALOG"
      ],
      "currentConsumption": {
        "idleUa": 500,
        "typicalActiveUa": 700,
        "maxActiveUa": 1200,
        "defaultMode": "active"
      },
      "analogCharacteristics": {
        "gainBandwidthHz": 1000000,
        "railToRailInput": false,
        "railToRailOutput": false,
        "inputCommonModeIncludesGround": true,
        "note": "단일전원 센서 프런트엔드에 많이 쓰이지만 상단 출력 스윙 여유가 필요합니다."
      },
      "recommendedCircuit": [
        "중간 바이어스 전압 유지",
        "폐루프 이득 대비 GBW 검토",
        "ADC full-scale 초과 여부 확인"
      ],
      "tags": [
        "opamp",
        "analog",
        "lm358"
      ]
    }
  },
  {
    "canonicalMpn": "MCP6002T-I/SN",
    "manufacturerName": "Microchip Technology",
    "normalizedPartName": "MCP6002 rail-to-rail dual operational amplifier",
    "datasheetUrl": "https://ww1.microchip.com/downloads/en/DeviceDoc/21733j.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "MCP6002",
      "MCP6002-I/P",
      "MCP6002T-I/OT"
    ],
    "pinSchemaJson": {
      "package": "SOIC-8 / DIP-8 / MSOP-8",
      "pinCount": 8,
      "powerPins": [
        "VDD"
      ],
      "groundPins": [
        "VSS"
      ],
      "signalPins": [
        "OUTA",
        "INA-",
        "INA+",
        "OUTB",
        "INB-",
        "INB+"
      ],
      "interfaces": [
        "ANALOG"
      ]
    },
    "specsJson": {
      "category": "analog-front-end",
      "summary": "저전력 rail-to-rail 듀얼 OP-Amp. 3.3V 센서/ADC 인터페이스에 자주 쓰입니다.",
      "supplyVoltage": {
        "min": 1.8,
        "typ": 3.3,
        "max": 6.0,
        "recommended": [
          3.3,
          5
        ]
      },
      "ioVoltage": {
        "nominal": [
          1.8,
          3.3,
          5
        ]
      },
      "interfaces": [
        "ANALOG"
      ],
      "currentConsumption": {
        "idleUa": 100,
        "typicalActiveUa": 200,
        "maxActiveUa": 350,
        "defaultMode": "active"
      },
      "analogCharacteristics": {
        "gainBandwidthHz": 1000000,
        "railToRailInput": true,
        "railToRailOutput": true,
        "inputCommonModeIncludesGround": true
      },
      "recommendedCircuit": [
        "고임피던스 센서 버퍼용으로 적합",
        "대용량 부하 직접 구동은 피함",
        "폐루프 이득 대비 대역폭 검토"
      ],
      "tags": [
        "opamp",
        "rrio",
        "analog",
        "mcp6002"
      ]
    }
  },
  {
    "canonicalMpn": "OPA2333AIDR",
    "manufacturerName": "Texas Instruments",
    "normalizedPartName": "OPA2333 zero-drift rail-to-rail dual operational amplifier",
    "datasheetUrl": "https://www.ti.com/lit/gpn/opa2333",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "OPA2333",
      "OPA2333AID"
    ],
    "pinSchemaJson": {
      "package": "SOIC-8 / VSSOP-8",
      "pinCount": 8,
      "powerPins": [
        "V+"
      ],
      "groundPins": [
        "V-"
      ],
      "signalPins": [
        "OUTA",
        "INA-",
        "INA+",
        "OUTB",
        "INB-",
        "INB+"
      ],
      "interfaces": [
        "ANALOG"
      ]
    },
    "specsJson": {
      "category": "analog-front-end",
      "summary": "제로 드리프트 RRIO 듀얼 OP-Amp. 저오프셋 정밀 센서 프런트엔드에 적합합니다.",
      "supplyVoltage": {
        "min": 1.8,
        "typ": 3.3,
        "max": 5.5,
        "recommended": [
          3.3,
          5
        ]
      },
      "ioVoltage": {
        "nominal": [
          1.8,
          3.3,
          5
        ]
      },
      "interfaces": [
        "ANALOG"
      ],
      "currentConsumption": {
        "idleUa": 17,
        "typicalActiveUa": 17,
        "maxActiveUa": 25,
        "defaultMode": "active"
      },
      "analogCharacteristics": {
        "gainBandwidthHz": 350000,
        "railToRailInput": true,
        "railToRailOutput": true,
        "inputCommonModeIncludesGround": true,
        "note": "정밀도는 좋지만 GBW가 높지 않아 고이득/고주파 용도는 별도 검토가 필요합니다."
      },
      "recommendedCircuit": [
        "정밀 DC/저주파 증폭용 우선",
        "고이득 폐루프에서는 GBW 여유 확인"
      ],
      "tags": [
        "opamp",
        "precision",
        "rrio",
        "opa2333"
      ]
    }
  },
  {
    "canonicalMpn": "BSS138",
    "manufacturerName": "onsemi",
    "normalizedPartName": "BSS138 N-channel MOSFET for bidirectional level shifting",
    "datasheetUrl": "https://www.onsemi.com/pdf/datasheet/bss138-d.pdf",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "BSS138LT1G",
      "BSS138 level shifter"
    ],
    "pinSchemaJson": {
      "package": "SOT-23 / Module",
      "pinCount": 3,
      "powerPins": [],
      "groundPins": [],
      "signalPins": [
        "G",
        "S",
        "D"
      ],
      "interfaces": [
        "ANALOG",
        "DIGITAL"
      ]
    },
    "specsJson": {
      "category": "level-shifter",
      "summary": "I2C 양방향 레벨 시프터에 가장 흔히 쓰이는 N-MOSFET.",
      "ioVoltage": {
        "nominal": [
          1.8,
          3.3,
          5
        ]
      },
      "absoluteMax": {
        "vdsMax": 50,
        "vgsMax": 20
      },
      "interfaces": [
        "I2C",
        "GPIO"
      ],
      "requiresExternalParts": [
        "양쪽 풀업 저항",
        "저전압/고전압 전원 레일"
      ],
      "recommendedCircuit": [
        "SDA/SCL 오픈드레인 양방향 전용으로 사용",
        "SPI/UART 직결 시프팅 용도로는 TXS/TXB 또는 전용 버퍼 검토"
      ],
      "tags": [
        "level-shifter",
        "i2c",
        "mosfet",
        "bss138"
      ]
    }
  },
  {
    "canonicalMpn": "TXS0108EPWR",
    "manufacturerName": "Texas Instruments",
    "normalizedPartName": "TXS0108E 8-bit bidirectional level translator",
    "datasheetUrl": "https://www.ti.com/lit/gpn/txs0108e",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "TXS0108E",
      "8-channel level shifter"
    ],
    "pinSchemaJson": {
      "package": "TSSOP-20 / Module",
      "pinCount": 20,
      "powerPins": [
        "VCCA",
        "VCCB"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "A1",
        "A2",
        "A3",
        "A4",
        "A5",
        "A6",
        "A7",
        "A8",
        "B1",
        "B2",
        "B3",
        "B4",
        "B5",
        "B6",
        "B7",
        "B8",
        "OE"
      ],
      "interfaces": [
        "GPIO",
        "I2C"
      ]
    },
    "specsJson": {
      "category": "level-shifter",
      "summary": "오픈드레인/약한 push-pull 신호에 적합한 8채널 자동 방향 레벨 시프터.",
      "supplyVoltage": {
        "min": 1.2,
        "typ": 3.3,
        "max": 5.5,
        "recommended": [
          1.8,
          3.3,
          5
        ]
      },
      "ioVoltage": {
        "nominal": [
          1.2,
          1.8,
          3.3,
          5
        ]
      },
      "interfaces": [
        "GPIO",
        "I2C"
      ],
      "currentConsumption": {
        "idleUa": 8,
        "typicalActiveUa": 8,
        "maxActiveUa": 20,
        "defaultMode": "enabled"
      },
      "requiresExternalParts": [
        "OE 풀업 또는 정의된 enable 상태",
        "양쪽 전원 레일"
      ],
      "recommendedCircuit": [
        "I2C/느린 GPIO 우선",
        "강한 SPI/클럭선에는 SN74AXC/TXB/TXU 계열 재검토"
      ],
      "tags": [
        "level-shifter",
        "txs0108e",
        "i2c",
        "gpio"
      ]
    }
  },
  {
    "canonicalMpn": "TXB0108PWR",
    "manufacturerName": "Texas Instruments",
    "normalizedPartName": "TXB0108 8-bit bidirectional voltage-level translator",
    "datasheetUrl": "https://www.ti.com/lit/gpn/txb0108",
    "lifecycleStatus": "active",
    "sourceQuality": "official-partial",
    "aliasNames": [
      "TXB0108",
      "8-bit auto direction level shifter"
    ],
    "pinSchemaJson": {
      "package": "TSSOP-20 / Module",
      "pinCount": 20,
      "powerPins": [
        "VCCA",
        "VCCB"
      ],
      "groundPins": [
        "GND"
      ],
      "signalPins": [
        "A1",
        "A2",
        "A3",
        "A4",
        "A5",
        "A6",
        "A7",
        "A8",
        "B1",
        "B2",
        "B3",
        "B4",
        "B5",
        "B6",
        "B7",
        "B8",
        "OE"
      ],
      "interfaces": [
        "GPIO",
        "SPI",
        "UART"
      ]
    },
    "specsJson": {
      "category": "level-shifter",
      "summary": "자동 방향 push-pull용 레벨 시프터. 외부 풀업/강한 버스 드라이버와는 상성이 나쁠 수 있습니다.",
      "supplyVoltage": {
        "min": 1.2,
        "typ": 3.3,
        "max": 5.5,
        "recommended": [
          1.8,
          3.3,
          5
        ]
      },
      "ioVoltage": {
        "nominal": [
          1.2,
          1.8,
          3.3,
          5
        ]
      },
      "interfaces": [
        "GPIO",
        "SPI",
        "UART"
      ],
      "currentConsumption": {
        "idleUa": 4,
        "typicalActiveUa": 4,
        "maxActiveUa": 20,
        "defaultMode": "enabled"
      },
      "requiresExternalParts": [
        "OE 정의",
        "양쪽 전원 레일"
      ],
      "recommendedCircuit": [
        "push-pull GPIO/SPI/UART 위주로 사용",
        "I2C에는 BSS138/TXS 계열이 더 적합"
      ],
      "tags": [
        "level-shifter",
        "txb0108",
        "spi",
        "uart",
        "gpio"
      ]
    }
  }
] as PartMasterRecord[];
