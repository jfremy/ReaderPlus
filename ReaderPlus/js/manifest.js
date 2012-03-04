this.manifest = {
    "name": "Deduplicator for Google Reader™",
    "icon": "images/logo.png",
    "settings": [
        {
            "tab": "Information",
            "group": "Grouping",
            "name": "sensibility",
            "type": "slider",
            "max": 1,
            "min": 0,
            "step": 0.01,
            "label": "Sensibility:",
            "display": true
        },
        {
            "tab": "Information",
            "group": "Grouping",
            "name": "description",
            "type": "description",
            "text": "The sensibility is actually a cosine value between 0 and 1 (no negative values). Values close to 1 means the system is very sensitive to differences while 0 means that anything will match with anything. Default is 0.4."
        }
    ],
    "alignment": [
    ]
};